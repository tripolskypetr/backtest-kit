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

The Walker Validation Service helps you keep track of and make sure your parameter sweep configurations are set up correctly. Think of it as a central place to register your different testing setups (walkers) and double-check they exist before you start running things. 

It keeps a record of all your walkers, which define the ranges of parameters you're testing, and it remembers whether a walker is valid to speed things up.

Here's what you can do:

*   Register new walkers using `addWalker`.
*   Confirm a walker exists before using it with `validate`.
*   Get a list of all registered walkers with `list`.

This service ensures your testing processes are reliable and efficient by managing and verifying your walker configurations.

## Class WalkerUtils

WalkerUtils is a helper tool designed to simplify working with walkers, which are essentially automated systems for backtesting trading strategies. It provides a central, easy-to-use way to run and manage these walkers.

Think of it as a shortcut to running walkers, automatically handling things like figuring out which exchange and data to use and keeping track of what's happening. There’s only one instance of this tool available at any time, making it convenient to access.

Here’s what it can do:

*   **Run a walker:**  Executes a backtest and provides a stream of results.
*   **Run in the background:** Executes a backtest without needing to see the results, useful if you just want to do something like log progress or trigger other actions.
*   **Stop walkers:** Gracefully halts all strategies within a walker, preventing new signals from being generated while allowing current signals to finish.  It makes sure to stop each strategy correctly, avoiding any unexpected issues.
*   **Get data:** Retrieves the complete results from all strategies within a walker.
*   **Generate a report:** Creates a readable markdown report summarizing the walker’s performance, allowing you to easily analyze the results.
*   **Save the report:** Writes the report to a file on your computer.
*   **List walkers:** Shows you a list of all currently running walkers and their status.




The system ensures that each combination of symbol and walker has its own dedicated instance, preventing interference and ensuring reliable results.

## Class WalkerSchemaService

The WalkerSchemaService helps you manage a collection of walker schemas, ensuring they're stored and accessed in a type-safe way. It leverages a registry to keep track of these schemas.

You can add new walker schemas using the `addWalker` method, and retrieve them later using their names.

It also performs a quick check (`validateShallow`) to make sure new schemas have the expected structure before they're added.

If a walker schema already exists, you can update it using the `override` function, which lets you provide only the properties you want to change.

The service also has internal components to handle logging and the underlying schema storage.

## Class WalkerReportService

WalkerReportService helps you keep track of how your trading strategies are performing during optimization. It essentially listens for updates from the optimization process and saves those results to a SQLite database.

This allows you to monitor your strategy's progress, compare different parameter sets, and ultimately find the best configuration.

You can think of it as a dedicated record keeper for your optimization experiments.

To use it, you subscribe to receive these progress updates, and when you're done, you unsubscribe.  The service makes sure you don't accidentally subscribe multiple times, which could lead to unexpected behavior.

The `tick` property is the core engine handling the optimization events and writing data. A logger service is also included for debugging.

## Class WalkerMarkdownService

The WalkerMarkdownService is designed to automatically create and save reports detailing your trading strategy's performance. It keeps track of how your strategies are doing by listening for updates from the trading process.

Essentially, it gathers data about your strategies, organizes it, and presents it in a clear, readable Markdown table. These reports are saved to your logs, making it easy to review and compare your strategies.

Here's how it works:

*   It uses a special storage system to keep data separate for each trading strategy (walker).
*   You subscribe to receive updates from the trading process; an unsubscribe function is provided to stop this.
*   A `tick` function processes the incoming updates and stores the results.
*   You can request specific data, generate reports, or save reports to disk using functions like `getData`, `getReport`, and `dump`.
*   The `clear` function allows you to erase the collected data, either for a specific strategy or all of them.

## Class WalkerLogicPublicService

WalkerLogicPublicService acts as a central coordinator for managing and running walkers, which are essentially pieces of code that execute and analyze trading strategies. It builds on top of WalkerLogicPrivateService, adding a layer of convenience by automatically handling important context information like the strategy name, the exchange used, and the name of the data frame being analyzed.

This service provides a `run` method that’s your primary way to kick off a walker comparison. When you call `run`, it figures out which strategies to execute and passes along all the necessary contextual information, making it easier to track and understand what’s happening during the backtesting process. Think of it as a conductor of an orchestra, ensuring all the parts play together correctly.

The service also has underlying components like loggerService, walkerLogicPrivateService and walkerSchemaService that allow it to function properly.

## Class WalkerLogicPrivateService

This service manages the comparison of different trading strategies, often referred to as a "walker." It handles the execution of each strategy and keeps track of its progress.

The `run` method is the main entry point, allowing you to specify the trading symbol, a list of strategies to compare, and the metric you'll use to evaluate them (like profit or drawdown).

As each strategy finishes running, this service provides updates, so you can monitor the comparison in real-time. It also determines the best-performing strategy based on the chosen metric.

Finally, it delivers a complete report summarizing the results, with all strategies ranked according to their performance. It relies on other services like `BacktestLogicPublicService` to carry out the actual backtesting of each strategy.


## Class WalkerCommandService

The WalkerCommandService acts as a central point for interacting with the walker functionality within the backtest-kit framework. It's designed to be easily integrated into your application, primarily through dependency injection. 

Think of it as a convenient layer on top of the more complex WalkerLogicPublicService, simplifying how you access core walker features.

It handles tasks like running walker comparisons, which essentially means comparing different strategies or approaches for a specific financial symbol. When you run a walker, you provide information about the strategies, exchanges, and data frames involved, and the service manages the execution and returns the results. 

The service also relies on several other services like logger, schema validators, and risk/action validators, to ensure everything runs smoothly and accurately.

## Class TimeMetaService

The TimeMetaService is designed to help you track the most recent candle timestamp for your trading strategies. Think of it as a reliable source for knowing the current time within your trading system, even when you're not actively executing trades.

It essentially maintains a record of these timestamps, organized by symbol, strategy, exchange, and timeframe. If you need to know the current time outside of the normal trading cycle—for example, when a special action needs to be taken—this service provides that information.

If you’re already in the middle of a trade execution, it will quickly fetch the timestamp from a nearby source. Otherwise, it will wait briefly for the first timestamp and then store it for later use.

You can clear these stored timestamps to make sure your system always has the freshest data, either for specific strategies or for all of them at once. This service is automatically updated after each trading tick and is a crucial component for keeping your trading information accurate and current.

## Class SystemUtils

The `SystemUtils` class helps keep your backtesting sessions clean and isolated. It prevents one test from accidentally affecting another by temporarily disconnecting everything listening to global events.

Think of it as putting each backtest into its own little bubble.

The `createSnapshot` function is key to this. It takes a picture of how your global event listeners are currently set up. This allows you to “reset” everything to a clean state before starting a new test, and then later restore that original setup. This ensures each backtest runs independently and gives you reliable results.


## Class SyncUtils

The SyncUtils class helps you analyze and understand the lifecycle of your trading signals. It gathers data from signal opening and closing events, allowing you to track what's happening with your strategies.

You can use this class to get statistical summaries of your signals, like the total number of opens and closes. It can also create detailed markdown reports that show you the specifics of each signal, including entry and exit prices, profit/loss, and more.

Finally, this class simplifies the process of saving these reports to files, with automatically generated filenames that include the symbol, strategy, exchange, and frame. It’s a tool for understanding and auditing your trading signal performance.

## Class SyncReportService

The SyncReportService is designed to keep a record of when signals are opened and closed, creating a detailed audit trail for your trading activity. It listens for synchronization events related to signals—specifically when a signal is first created (signal-open) and when it’s closed (signal-close).

When a signal is opened, it captures all the details and logs them. When a signal is closed, it records things like profit and loss (PNL) and the reason for the closure.

It uses a dedicated logger for debugging and depends on a 'tick' object to handle the actual processing and logging.

You can subscribe to receive these signal synchronization events, and importantly, the system makes sure you don’t accidentally subscribe multiple times. The subscribe method returns a function that you can use to unsubscribe and stop receiving updates. If you've already subscribed, the unsubscribe method will gracefully stop the process.


## Class SyncMarkdownService

This service helps you keep track of and generate reports about signal synchronization events during your trading backtests or live trading. It listens for signal open and close events, carefully organizing them based on the symbol, strategy, exchange, timeframe, and whether it's a backtest or live trade.

Think of it as a diligent record-keeper for your signals, accumulating all the details. It then compiles this information into neatly formatted Markdown reports that you can save and analyze.

You can subscribe to receive these signal events, and the system prevents duplicate subscriptions. Unsubscribing completely cleans up all stored data and stops the monitoring.

The `tick` method is the engine that processes each signal event, assigning timestamps and routing it to the correct storage location. You can retrieve statistics, generate reports, or even dump reports directly to files.

If you need to completely clear the data, you can do so for specific combinations of symbol, strategy, exchange, timeframe, and backtest status, or clear everything at once.

## Class StrategyValidationService

The StrategyValidationService helps you keep track of and verify your trading strategies. It acts like a central hub, remembering all the strategies you've defined and making sure they’re set up correctly.

It lets you register new strategies using `addStrategy()`, and it automatically checks to ensure that each strategy exists and that any linked risk profiles and actions are also valid. 

To speed things up, the service remembers the results of its validations, so it doesn't have to repeat checks unnecessarily. You can see a list of all registered strategies with `list()`.

It relies on other services – `loggerService`, `riskValidationService`, and `actionValidationService` – to handle logging, risk assessment, and action validation respectively.

## Class StrategyUtils

StrategyUtils helps you analyze and report on your trading strategy's performance. Think of it as a central place to gather and understand the events that happen during trading, like when orders are canceled, profits are taken, or losses are managed.

It lets you pull out statistical data, such as how often different actions occur, providing insights into strategy behavior. 

You can also generate detailed markdown reports which present events in a structured table format, including key information like the price, percentage values, and timestamps. This makes it much easier to visually examine what your strategy is doing.

Finally, StrategyUtils allows you to save these reports directly to files, creating a documented history of your strategy's actions. The report file names are automatically created to include the symbol, strategy name, exchange, frame, and a timestamp for easy identification.


## Class StrategySchemaService

The StrategySchemaService helps keep track of different trading strategy blueprints in a safe and organized way. It uses a special system to ensure that the schemas are typed correctly, preventing errors.

You can add new strategy schemas using the `addStrategy()` function, and then find them later by their name. 

The service also checks new schemas to make sure they have all the necessary parts before they're added. If a schema already exists, you can update it with new information using the `override()` function. Finally, `get()` allows you to easily retrieve a strategy schema by its name. 

This service relies on a logger to record events and a registry to store the strategy schemas.

## Class StrategyReportService

This service is designed to keep a detailed audit trail of your trading strategy's actions. It's like a dedicated logger that records events like canceling scheduled orders, closing pending positions, taking partial profits or losses, adjusting trailing stops or take profits, and setting breakeven prices.

To start using it, you need to subscribe to the service, which enables the logging functionality. Each time a significant action happens in your strategy, the service writes a separate JSON file containing the details. This contrasts with other reporting methods that might store everything in memory.

When you’re done tracking these events, you can unsubscribe to stop the logging. This is important for keeping things tidy and avoiding unnecessary file creation. The subscribe method uses a special pattern to ensure only one logging subscription is active at any time, and unsubscribing is safe to do even if you haven't subscribed.



The service relies on other components for logging and context information, making it easy to integrate into your existing infrastructure. It's particularly useful for analyzing strategy behavior and troubleshooting issues.

## Class StrategyMarkdownService

This service helps you track and analyze events occurring during your trading strategy backtests or live trading. It's like a central hub for recording actions like canceling orders, closing positions, and adjusting stops.

Instead of writing each event to a file immediately, this service temporarily stores them in memory, allowing you to process them in batches for more efficient reporting. It’s designed to be more performant when dealing with a lot of data.

Here's how it works:

1.  **Start listening:** You need to "subscribe" to start collecting events.
2.  **Events are automatically captured:** As your trading strategy executes, events like `cancelScheduled`, `closePending`, and `partialProfit` are recorded.
3.  **Get your data:** Use `getData` to pull out statistics or `getReport` to create a well-formatted Markdown report of your strategy’s actions.  You can customize which columns appear in the report.
4.  **Save your report:**  The `dump` function generates and saves the report as a Markdown file, including a timestamp in the filename.
5.  **Clean up:**  When you're done, "unsubscribe" to stop event collection and erase the stored data.

Think of it as a temporary buffer for your strategy’s activity, letting you generate concise and insightful reports later. The service also offers a way to clear this buffer if needed. There’s a memoized storage system for the reports, ensuring efficient creation and retrieval.

## Class StrategyCoreService

This service acts as a central hub for managing strategy operations, providing access to key information and functionalities related to a trading strategy. It combines services for strategy connections, risk validation, and execution context.

It offers a range of methods to retrieve details about a pending or scheduled signal, including its cost basis, invested amount, P&L, and entry prices. These methods are particularly useful for monitoring and analyzing a strategy's performance.

You can use it to get information about a strategy's current state: whether it's stopped, whether a signal is pending or scheduled, or retrieve details like breakeven price and drawdown metrics.

The service provides methods for executing actions like closing pending signals, activating scheduled signals, and adjusting stop-loss or take-profit levels. It also handles validation and memoization to optimize performance and prevent redundant calculations. Finally, it includes methods for disposing of strategies and clearing cached data. It's designed to be a core component in both backtesting and live trading environments, ensuring consistent and reliable strategy management.

## Class StrategyConnectionService

The StrategyConnectionService acts as a traffic controller for your trading strategies, ensuring the right strategy handles each trade based on the symbol and other details. It caches these strategies to improve performance, preventing unnecessary re-creation. Before any trading operations occur, it guarantees that the system is properly initialized. It handles both live trading (tick) and historical simulations (backtest).

Here's a breakdown of its key features:

*   **Smart Routing:**  It automatically directs trading actions to the correct strategy based on factors like the trading symbol and specific settings.
*   **Efficient Caching:**  It stores frequently used strategies to avoid recreating them, speeding up your trading process.
*   **Initialization Assurance:**  It ensures everything is ready before any trading happens.
*   **Dual Operation:** Supports both live (tick) and historical (backtest) trading.

The service provides various methods for retrieving information about a position, like its total cost, percentage closed, and entry prices. You can also adjust the position with actions like partial profit or loss, and even cancel or close pending signals. The service also has methods to monitor the position, like checking if it’s near breakeven or receiving updates on its current status. Finally, it allows for advanced actions like adjusting take-profit or stop-loss levels.


## Class StorageLiveAdapter

The `StorageLiveAdapter` is a flexible tool for managing signal data during live trading. It acts as a middleman, allowing you to easily switch between different ways of storing your data – like persistent storage to disk, in-memory storage, or even a dummy adapter for testing.

Think of it as a plug-in system; you can swap out the data storage method without changing the rest of your code.  The default setup uses persistent storage, saving your data to disk.

The adapter handles events like signals opening, closing, scheduling, and cancellation, forwarding these actions to the currently selected storage method. You can also find signals by their ID or list all signals.

There are helper functions (`usePersist`, `useMemory`, `useDummy`) to quickly change which storage method you're using. `useStorageAdapter` lets you specify your own custom storage implementation.

The `clear` function is important to use if your working directory changes between runs because it forces a refresh of the storage adapter.

## Class StorageBacktestAdapter

This component provides a flexible way to manage how backtest data is stored. It allows you to easily switch between different storage methods, like saving data to disk, keeping it in memory, or using a "dummy" adapter that doesn't actually save anything. 

You can choose a default persistent storage, or switch to an in-memory option for faster testing, or a dummy adapter if you just want to run through the logic without saving results. The system remembers the storage you're using, but you can always clear that memory and switch to a different one. 

It handles different types of signal events – when a signal is opened, closed, scheduled, or cancelled – and passes those actions on to the storage method you've selected. You can also find signals by their ID, list all signals, and update the "last updated" time based on ping events.  If you need to change how data is stored, you can simply tell it to use a different storage adapter. If your testing environment changes, like when the working directory shifts, you should clear the stored instance to ensure proper initialization.

## Class StorageAdapter

The StorageAdapter is responsible for managing how your trading signals are saved and accessed, both during backtesting and in a live trading environment. It automatically keeps track of new signals as they arrive, ensuring they’re stored correctly.

It's designed to be easy to use – you simply enable it to start storing signals, and disable it when you no longer need that functionality.

You can retrieve signals by their unique ID, or list all signals that were generated during backtesting or all signals from live trading. It prevents accidental duplicate subscriptions, ensuring your storage remains clean and efficient.


## Class StateLiveAdapter

The `StateLiveAdapter` helps manage and store information about trading signals, allowing different ways to handle that data. Think of it as a central hub for keeping track of important details for each trade.

It’s designed to be flexible, letting you choose where this information is stored – either in memory for quick access, on disk for persistence across restarts, or even as a dummy to simply discard updates. The default is to store data on disk, which ensures that your trading information isn’t lost when your application restarts.

To keep things organized, it uses a system of memoization, meaning it remembers previously fetched data to avoid redundant work. When a signal is finished or cancelled, the `disposeSignal` method cleans up these cached entries.

The adapter's features are particularly useful for implementing more complex trading strategies, like those driven by AI, where you want to automatically exit trades if certain conditions aren't met, while ensuring that the information used to make those decisions is reliably saved.

You can easily switch between storage options using `useLocal`, `usePersist`, and `useDummy`. `useStateAdapter` provides a way to inject entirely custom ways to handle state. The `clear` method is helpful for ensuring the data gets refreshed if the working directory changes.

## Class StateBacktestAdapter

The `StateBacktestAdapter` helps manage and store information related to your trading strategies, like how much profit a trade has made or how long it's been open. It's designed to be flexible, allowing you to easily switch between different ways of storing this data—whether it's just in the computer's memory, saved to a file, or even discarded entirely for testing purposes.

You can choose between three built-in storage options: a simple in-memory solution, a persistent file-based storage, or a dummy option for testing.  The adapter also keeps track of things like peak profit and time held for each trade to help enforce rules, like automatically exiting a trade if it hasn’t met certain criteria.

To keep things organized, the adapter automatically manages these data instances, and provides a method (`disposeSignal`) to clear them when a signal is cancelled.

The `clear` method is important if your project's working directory changes, as it forces the adapter to create fresh instances to avoid unexpected behavior. Essentially, it’s a way to reset the stored data.


## Class StateAdapter

The StateAdapter acts as a central hub for managing how your trading strategies store and access data, whether it's for backtesting or live trading. It makes sure that subscriptions to signals are handled cleanly, automatically cleaning up old data when signals are finished. 

Think of it as a smart manager that prevents data from piling up unnecessarily.

You can enable the adapter to start storing data, and disable it to stop. 

To retrieve data, you use `getState`, specifying the signal ID, bucket name, initial value, whether it’s backtest mode, and a timestamp.  To update the data, you use `setState` and provide the same information plus the new data. The adapter takes care of directing these requests to the correct storage system – whether it's for backtesting or live trading – based on the provided parameters.


## Class SizingValidationService

This service helps you keep track of and double-check your position sizing methods. Think of it as a central place to register all your different sizing strategies, like fixed percentages or Kelly criterion approaches. 

Before you use a sizing strategy in your backtesting, this service verifies that it's been properly registered, preventing errors and making your code more reliable.

It also remembers its validation results, which speeds things up if you're doing a lot of checks. 

You can easily add new sizing strategies using `addSizing`, check if a strategy exists with `validate`, and get a full list of registered strategies with `list`.

## Class SizingSchemaService

The SizingSchemaService helps you organize and manage different strategies for determining how much to trade. It uses a system that ensures everything is typed correctly and avoids errors.

You add new sizing strategies using `addSizing()`, and then easily find them later by their names.

Before a sizing strategy is added, it’s quickly checked to make sure it has all the necessary parts. This helps prevent problems down the road.

The `register` method adds a new sizing strategy to the system.

The `override` method lets you update an existing sizing strategy with just the parts you want to change.

The `get` method allows you to retrieve a specific sizing strategy based on its name.


## Class SizingGlobalService

The SizingGlobalService handles how much of an asset your strategy will trade at any given time. 

It's a central component, working behind the scenes to determine appropriate position sizes.

This service relies on other services to manage connections and validate sizing calculations.

The core function, `calculate`, takes parameters like risk tolerance and market data, and figures out the size of the trade. Think of it as the engine that ensures your trades are aligned with your risk management plan.

## Class SizingConnectionService

The SizingConnectionService helps manage how position sizes are calculated within the backtest-kit framework. It acts as a central hub, directing sizing requests to the correct sizing implementation based on a name you provide.

To improve performance, it remembers previously used sizing implementations, so it doesn’t have to recreate them every time.

Think of it as a smart router for sizing calculations, ensuring the right sizing method is used for the job and doing so efficiently.

You can specify which sizing method to use through the `sizingName` parameter. If a strategy doesn't have specific sizing configurations, the `sizingName` will be an empty string.

The `getSizing` property allows you to retrieve those memoized sizing instances. The `calculate` method is where the actual sizing calculation happens, considering your risk parameters and the chosen sizing method. It can handle sizing techniques like fixed percentages or Kelly Criterion.


## Class SessionLiveAdapter

This component provides a flexible way to manage and store data during live trading sessions. Think of it as a central hub that allows you to easily switch between different storage methods. By default, it saves session data to a file on your computer, so the information isn't lost even if your program restarts.

You can also choose to keep the data only in memory for faster access, or use a "dummy" adapter that simply ignores all data changes for testing purposes. This adaptability is achieved through an adapter pattern, making it simple to plug in alternative storage solutions if needed.

The `useLocal()`, `usePersist()`, `useDummy()`, and `useSessionAdapter()` methods make switching these different storage approaches very straightforward. Importantly, it remembers the best storage option based on things like the trading symbol, strategy name, exchange, and frame. There's even a way to completely clear this memory if your project's working directory changes. The `getData` and `setData` methods allow you to read and write to the currently configured session data storage.

## Class SessionBacktestAdapter

This framework component, the SessionBacktestAdapter, helps manage and store data during backtesting runs in a flexible way. It acts as a middleman, allowing you to easily swap out different storage methods without changing the core backtesting logic.

You can choose between a few different data storage options: an in-memory solution (default, for quick testing), a file-based option (for saving your results), or even a "dummy" adapter that simply discards the data.

The adapter keeps track of session data based on the trading symbol, the strategy being used, the exchange, and the timeframe. This allows it to efficiently retrieve and update data for specific scenarios.

You can switch between these storage options using convenient helper functions like `useLocal`, `usePersist`, and `useDummy`.  It's also possible to plug in your own custom storage solutions. 

If you're working with strategies that change the base directory, you can use the `clear` method to refresh the data caches.

## Class SessionAdapter

The SessionAdapter acts as a central hub for handling data within your trading sessions, whether you’re running a backtest or a live trading environment. 

It intelligently directs data operations – reading and writing – to the appropriate system, either the backtest storage or the live session storage.

To retrieve a value associated with a specific trading signal, you'll use the `getData` method, providing details like the symbol, strategy name, exchange, frame, and a timestamp.  Similarly, `setData` allows you to update the value of a signal's data, ensuring it's saved in the correct location depending on whether you’re in backtest mode.


## Class ScheduleUtils

ScheduleUtils helps you monitor and understand how your scheduled signals are performing. It's like a central hub for keeping tabs on signals that are waiting to be executed.

This tool lets you track signals as they’re queued up, see which ones have been cancelled, and calculate things like how often cancellations happen and how long signals typically wait.

You can easily get detailed statistics about a specific symbol and strategy, or generate a clear, readable markdown report summarizing all the scheduled events—great for analyzing and debugging. 

It also provides a way to save these reports directly to a file. Think of it as a way to gain visibility into the health and efficiency of your scheduled trading signals. 


## Class ScheduleReportService

This service helps you keep track of how your scheduled signals are performing. It listens for events related to those signals – when they’re scheduled, when they start, and when they're cancelled. 

The service calculates how long it takes from the initial scheduling to when a signal actually executes or gets cancelled, providing insight into potential delays. 

It then saves this information to a database so you can analyze it later. To make sure you're not accidentally tracking the same signal multiple times, it uses a mechanism to prevent duplicate subscriptions.

You can tell it to start listening for signals using the `subscribe` method, which also gives you a way to stop listening with an `unsubscribe` function. If you try to unsubscribe when it isn't actively listening, nothing happens.

## Class ScheduleMarkdownService

This service automatically creates reports detailing scheduled and cancelled trading signals. It keeps track of these events for each strategy you're using, compiling the data into nicely formatted markdown tables.

You'll find these reports in the `logs/schedule/{strategyName}.md` directory, providing insights into how signals are being scheduled and whether any are being cancelled. The reports also include useful statistics like cancellation rates and average wait times, helping you understand your strategies' performance.

To use it, the service listens for signal events. You can tell it to start listening and then later stop, or let it run continuously. It builds up its data as signals are created and cancelled, and you can ask it for the raw data or for a complete report at any time. You can also clear the accumulated data if needed, either for a specific strategy or all strategies.

## Class RiskValidationService

This service helps you keep track of and verify your risk management settings. It acts like a central record book for your risk profiles, ensuring they’re set up correctly before you proceed with any actions. To improve performance, it remembers the results of its checks so it doesn’t have to repeat validation unnecessarily. 

You can use it to register new risk profiles, quickly check if a profile exists when needed, and view a complete list of all registered profiles. It also has a way to log information about its actions. 

Essentially, it's designed to make managing your risk configurations reliable and efficient.


## Class RiskUtils

This class provides tools for analyzing and reporting on risk rejection events within your trading system. It acts as a central point for accessing and summarizing data related to risk rejections, helping you understand and improve your trading strategies.

You can use it to gather statistical information about rejections, such as the total number of rejections and how they are distributed across different symbols and strategies.

The class can also generate detailed markdown reports, including tables of rejection events with relevant information like the symbol, strategy, position, price, and reason for the rejection. These reports help pinpoint patterns and potential issues.

Finally, you can easily export these reports to files for archiving or sharing, with the files automatically named in a clear and organized format based on the symbol and strategy. The whole process of creating and saving the report is handled for you.

## Class RiskSchemaService

This service helps you manage and store your risk schemas in a safe and organized way. It uses a special system to keep track of your schemas, ensuring the data types are correct. 

You can add new risk profiles using the `addRisk()` function (represented here as `register`) and then find them again later by their name using the `get()` function.

The `validateShallow()` function checks your risk schemas to make sure they have all the necessary parts before they're saved. 

If a risk profile already exists, you can update it with the `override()` function, providing only the changes you need. 

The service also has a built-in logger for tracking what’s happening.

## Class RiskReportService

The RiskReportService is designed to keep a record of when risk checks reject trading signals. It acts like a safety net, catching those rejections and saving the details – like why the signal was rejected and what it was supposed to do.

You'll use it to listen for these rejection events. 

It uses a logger to help with debugging, and it's built to avoid accidentally subscribing multiple times.

To start monitoring rejections, you'll subscribe to the rejection events. This will give you a function you can call later to stop listening. 

If you need to stop tracking rejections, you can unsubscribe; this safely stops the process, and won't cause any problems if it wasn't subscribed in the first place. 


## Class RiskMarkdownService

This service helps you create and save reports about rejected trades, which is useful for understanding why your trading strategies aren't executing as expected. It listens for events indicating rejected trades and organizes them by the symbol being traded and the strategy being used.

The service automatically generates markdown tables filled with details about these rejections, and also provides summary statistics like the total number of rejections, broken down by symbol and strategy.  You can save these reports to disk as markdown files, making them easy to read and share.

It’s designed to be flexible, allowing you to customize which data is included in the reports. You can also clear out the accumulated data if needed, either for everything or just specific trading setups. This makes it simple to analyze and address issues related to trade rejections.

## Class RiskGlobalService

This service is the central hub for managing risk limits within the trading framework. It acts as a gatekeeper, making sure trades adhere to pre-defined risk rules before they're executed.

It works closely with the connection service to validate risk configurations and is used both internally by trading strategies and by the public-facing API.

Several components work together within this service:
*   It keeps track of risk validation activity with logging.
*   It efficiently reuses previous validations to prevent unnecessary checks.
*   It offers a special check to validate trades and reserve resources safely, preventing conflicts when multiple trades happen at once.

You can also use it to register new trades (signals) and remove them once they’re closed. Finally, it provides a way to completely reset the risk data, either for everything or for a specific risk configuration.

## Class RiskConnectionService

The RiskConnectionService acts as a central hub for managing risk checks within your trading system. It intelligently connects different parts of your code to the right risk management logic, making sure your trading decisions stay within predefined limits.

Think of it as a traffic controller, directing risk-related requests to the appropriate handler. To improve performance, it remembers previously used risk configurations, so it doesn't have to re-create them every time.

Here's a breakdown of its key functionalities:

*   **Risk Routing:** It directs risk checks based on a `riskName`, ensuring that each trading strategy uses the correct risk parameters. If a strategy doesn't have specific risk configurations, an empty `riskName` is used.
*   **Signal Validation:** `checkSignal` validates whether a trading signal should be executed, considering factors like portfolio drawdown, symbol exposure, position counts, and daily loss limits. It notifies you when a signal is rejected.
*   **Concurrent Safety:** `checkSignalAndReserve` offers a safer way to validate signals, particularly in high-volume trading environments, to avoid issues with shared resources.
*   **Signal Tracking:** `addSignal` and `removeSignal` keep track of open and closed positions, respectively, updating the risk management system accordingly.
*   **Cache Management:** `clear` allows you to manually clear cached risk configurations, useful for situations where you might need to reset or reload risk settings.

The service relies on several other components – like `RiskSchemaService` and `TimeMetaService` – to function effectively, and these are provided through its dependencies.

## Class ReportWriterAdapter

The ReportWriterAdapter helps you manage and store your trading data, like backtest results or live trading events, in a structured way. It acts as a flexible layer, allowing you to easily swap out how and where this data is saved.

It keeps track of the storage used for different types of reports (backtest, live trades, walker data, etc.) and makes sure there's only one storage instance for each type throughout your application's lifetime. This improves efficiency and prevents unexpected behavior.

You can customize which storage method is used – the default is a simple JSONL append – or provide your own custom storage solution. The adapter intelligently starts up the necessary storage when you first write data and handles the details behind the scenes.

If you need to temporarily disable data writing for testing or debugging, there's a handy "dummy" adapter that effectively ignores all writes. You can also easily revert to the standard JSONL format.  The adapter remembers which storage method you've chosen, making it convenient to switch between them. If the working directory changes, it helps to clear the cache to ensure proper storage.


## Class ReportUtils

ReportUtils helps you control which parts of the backtest-kit framework generate detailed logs.

Think of it as a way to turn on or off logging for things like backtesting, live trading, or performance analysis.

The `enable` function lets you pick which log types you want active, and it sets up a system to write event data to JSONL files in real-time.  It’s crucial to remember to use the cleanup function returned by `enable` to properly stop the logging and avoid problems later.

If you just want to stop a specific type of logging without affecting others, use the `disable` function. This immediately stops the logging for those services.

## Class ReportBase

The `ReportBase` class is designed to help you log events and perform analytics on your trading backtests. It writes data as simple JSON lines to files, making it easy to process and analyze later. Each report type gets its own file, and the system ensures data is written reliably, even if things get busy.

It automatically creates necessary directories and handles potential errors. You can search through these logs using criteria like the trading symbol, strategy, or exchange.

The class manages the writing process, ensuring it's efficient and includes safeguards like timeouts to prevent problems. It initializes itself only once, and you can safely call the initialization function multiple times.  The `write` method is how you add data to your report; it neatly formats the data along with important metadata for easy filtering.

## Class ReportAdapter

The ReportAdapter helps you manage and store your trading data in a flexible way. It's like a middleman that lets you easily swap out how your data is saved without changing the rest of your code.

Think of it as a system for plugging in different storage methods – you can choose between JSONL files, or even a dummy adapter that simply ignores all data. 

The adapter remembers which storage method is active, avoiding the need to reconfigure it repeatedly.

It also creates storage instances efficiently, creating one for each type of report and reusing it.  

If your working directory changes, you'll need to clear the cache to make sure new storage instances are created with the updated path. This is a simple way to keep your data organized and easily accessible for analysis.

## Class ReflectUtils

This utility class, `ReflectUtils`, provides a way to easily track key performance metrics for your trading strategies – things like profit and loss, peak profit, and drawdown. It acts as a central point for accessing this data consistently, ensuring everything is properly validated and logged. Think of it as a convenient way to get a quick snapshot of how your strategy is performing, whether you're running a live trade or backtesting.

You can use it to retrieve information like:

*   **Current PnL:**  Get the unrealized profit or loss in percentage or dollar terms for your open position.
*   **Peak Performance:** Discover the highest profit reached, when it happened, and what the PnL was at that point.
*   **Drawdown Analysis:** Understand how far your position has fallen from its peak, including the timing and magnitude of the worst drawdown.
*   **Time-Based Metrics:**  Find out how long a position has been active, waiting, or in drawdown.

It’s designed to be simple to use, with a single instance available throughout your code. The `backtest` parameter allows this information to be collected for both live and historical data. This class simplifies the process of gathering and interpreting key performance indicators for your trading strategy.

## Class RecentLiveAdapter

This class, `RecentLiveAdapter`, is designed to help you easily manage and access recent trading signals, and it's flexible enough to work with different storage options. It acts as a central point for getting information like the latest signal or how long ago a signal was created.

You can choose between storing signals persistently (on disk) or keeping them only in memory, which is useful for testing or when you don’t need long-term storage. The `usePersist()` and `useMemory()` methods let you quickly switch between these storage types.

If your working directory changes, like when you're running different strategies, it’s important to clear the cached instance with `clear()` to make sure the adapter uses the correct storage location. The adapter handles requests for signal data by passing them on to the currently selected storage method, making your code cleaner and more organized.

## Class RecentBacktestAdapter

This component manages how recent trading signals are stored and accessed. Think of it as a layer that sits between your trading strategies and the actual data storage. It allows you to easily switch between different storage methods – either keeping the data in memory for quick access or saving it to a file for persistence.

You can choose between an in-memory storage (the default) or a persistent storage option. The `usePersist()` and `useMemory()` functions let you switch between these.

The `clear()` function is important when you’re running multiple strategies, especially if your working directory changes; it forces the system to recreate its storage connection.

It provides methods for retrieving the most recent signal, calculating how long ago a signal was created, and responding to “ping” events.  The underlying storage does the actual work, and this component simply routes the requests. It's designed to be flexible, letting you swap out the storage backend without affecting the rest of your trading logic.

## Class RecentAdapter

The RecentAdapter is a key component that manages and stores recent trading signals, whether you're backtesting strategies or running them live.

It automatically updates its signal storage by listening for incoming data.
You can easily get the most recent signal for a specific trading symbol and situation, regardless of whether it came from backtest data or live data.

To prevent accidental double-subscriptions, it uses a "singleshot" pattern.

To tidy up, a cleanup function exists that unsubscribes from all data sources.

You can enable the adapter to start collecting signals, using the `enable` property; it ensures only one subscription happens.
The `disable` property allows you to stop the storage and unsubscription safely, even if called repeatedly.

The `getLatestSignal` function helps you retrieve the latest signal by symbol, strategy, exchange, and timeframe. To avoid look-ahead bias, it only returns signals that occurred *before* a specified time.

Finally, `getMinutesSinceLatestSignalCreated` tells you how much time has passed since the latest signal was generated, also taking into account the look-ahead time and current time.

## Class PriceMetaService

PriceMetaService helps you get the latest market price for a particular trading setup—think a specific symbol, strategy, exchange, and timeframe—without being directly in the middle of a trade execution. It keeps track of these prices and updates them whenever a new tick comes in.

If you need a price outside of a trade's immediate execution, like when a command needs to be run between ticks, this service provides a way to get that information.

It essentially remembers the last known price for each combination of symbol, strategy, exchange, and timeframe. If a price hasn't been seen yet, it’ll wait a little while to see if it arrives.

You can clear out these remembered prices to free up memory, either for everything or just for a specific trading setup. This is especially useful when starting a new trading simulation or live session to ensure you're working with fresh data. The service is managed automatically, so you don't have to worry about its setup.

## Class PositionSizeUtils

This class helps you figure out how much to trade based on different strategies. 

It provides ready-made formulas for position sizing, like fixed percentage, Kelly Criterion, and ATR-based methods. 

Each formula has built-in checks to ensure the data you provide aligns with the sizing approach you've selected.

The `fixedPercentage` method determines your position size by applying a set percentage of your account balance.

The `kellyCriterion` method calculates position size considering win rate and win/loss ratio to optimize potential returns.

The `atrBased` method uses the Average True Range (ATR) to estimate volatility and determine an appropriate position size.

Essentially, this class simplifies the process of determining how much capital to allocate to each trade using common sizing techniques.

## Class Position

The `Position` class provides helpful tools for determining take profit and stop loss prices when you’re trading. It automatically adjusts the direction (whether you're buying or selling) based on your position.

It offers two main strategies:

*   **moonbag:** This strategy sets a fixed take profit point at 50% above or below the current price, offering a simple way to manage gains.
*   **bracket:**  This strategy allows for more customization, letting you define your own take profit and stop loss percentages. 

These functions take information about your position (long or short), the current price, and the desired percentage for stop loss and take profit, and then return the calculated price levels for both.

## Class PersistStorageUtils

This class helps manage how signal data is saved and loaded persistently, especially when dealing with backtesting and live trading modes. It's designed to make sure your signal states are reliably stored and restored.

It uses a clever system to remember which storage method is in use, so you don't have to recreate them repeatedly.

You can easily switch between different storage methods, such as using standard files, a dummy storage for testing, or even providing your own custom storage solution.

The class automatically handles reading and writing all of your saved signals, making it easy to load previous states.

If you need to change the storage location or type, like when your working directory changes, there’s a method to clear the memory of previous storage configurations.

Signals are stored individually as files, each identified by a unique ID. This approach supports managing many signals and keeps states safe even if there are unexpected interruptions.


## Class PersistStorageInstance

This class provides a way to store and retrieve trading signals persistently, using files on your computer. Think of it as a way to save your signal data so you can come back to it later. 

It creates a separate file for each signal, making it organized and easy to manage. The storage is designed to be reliable even if your computer unexpectedly shuts down.

The `backtest` property indicates whether this is being used in a backtesting scenario.

The `waitForInit` method makes sure the storage is ready before you start using it. 

`readStorageData` pulls all your stored signals, reading them one by one from the individual files. 

`writeStorageData` saves a set of signals, writing each one to its own file using a unique identifier.

## Class PersistStateUtils

This utility class helps manage how your trading strategy's data is saved and loaded, ensuring it survives unexpected interruptions. It acts as a central point for storing strategy state, creating a new storage location for each signal and bucket combination. 

Think of it as a smart storage system that remembers which data belongs to which part of your strategy.

The class provides ways to:

*   Quickly access and save state data, avoiding redundant initialization.
*   Swap out the default storage method with your own custom solutions.
*   Clear out old storage data when needed, for example when your working directory changes.
*   Easily test with dummy data by switching to a "no-op" mode.

It handles the technical details of loading and saving data, allowing you to focus on the logic of your trading strategy. The data is stored in JSON files within a specific directory structure, and it uses atomic operations to prevent data corruption.

## Class PersistStateInstance

This class helps you save and load state information for your trading strategies, especially when you need to persist data across sessions. It's a way to keep track of things like indicator values or strategy settings.

The class uses a file-based storage system to reliably store your data, ensuring that it's saved correctly and consistently.  Each piece of data is organized using a unique identifier (`signalId`) and a bucket name (`bucketName`).

You don't need to worry about manually cleaning up resources; the class handles that automatically through a utility function.  The `waitForInit` method makes sure the storage is ready before you start working with it.  It provides easy methods to read (`readStateData`) and write (`writeStateData`) your data, and the `dispose` method does nothing as cleanup is handled elsewhere.

## Class PersistSignalUtils

This utility class helps manage how signal data is saved and retrieved for your trading strategies. It keeps track of signal information separately for each trading strategy, symbol, and exchange, ensuring that each has its own storage.

You can customize how this data is stored by providing your own signal instance constructors. The class handles reading and writing this data, creating storage instances as needed the first time they're accessed.

If you need to switch to a different storage method, functions are available to use a default file-based approach or a dummy instance that doesn’t actually store any data.  You can also completely clear the storage cache when necessary, for example, if the working directory changes.

## Class PersistSignalInstance

This class helps you save and load signal data persistently, ensuring that your backtesting results aren't lost if something goes wrong. It's designed to work with a specific trading symbol, strategy, and exchange. 

The class uses a file to store the data, making it reliable even in case of crashes. It handles writing the data safely, ensuring it’s saved correctly.

Here's a breakdown of what it does:

*   It takes the trading symbol, strategy name, and exchange name as input when you create it.
*   It keeps track of these details internally.
*   `waitForInit` gets the storage ready to use.
*   `readSignalData` retrieves the saved signal data using the symbol as a unique identifier.
*   `writeSignalData` saves the current signal data, or clears it if you provide a null value.


## Class PersistSessionUtils

This class helps manage how your trading strategy's session data is saved and loaded. Think of it as a helper for remembering things like settings or states across different runs of your strategy.

It keeps track of where your data is stored, which by default is in files within a `dump/session` directory organized by strategy, exchange, and frame name.

You can customize how this data is stored – for example, to use a dummy implementation for testing or to connect to a database instead of files.

The class handles making sure the data is saved and loaded safely and efficiently, using a system that avoids unnecessary re-initialization.

There are methods for clearing the saved data, setting up initial data, and managing the specific type of data persistence used. This makes it easy to clean up old data or swap out different storage methods as needed.

## Class PersistSessionInstance

This class provides a way to save and load session data, specifically designed for trading strategies and exchanges. It's like a persistent memory for your trading setup, allowing you to resume where you left off.

It uses a file to store this data, organizing it by strategy and exchange names, and uniquely identifies each piece of data with a frame name. 

You don't need to worry about cleaning up resources directly; a separate utility handles that part, keeping everything tidy.

The `waitForInit` method sets up the storage before you start using it. 
`readSessionData` retrieves saved data, while `writeSessionData` saves new or updated data. The `dispose` method does nothing directly, but relies on another process to handle cleanup.

## Class PersistScheduleUtils

This class, `PersistScheduleUtils`, helps manage how trading signals are saved and loaded for strategies, particularly for scheduled signals. It ensures that each strategy has its own isolated storage for these signals, preventing conflicts.

You can customize how these signals are stored using different adapters, or revert back to a default file-based approach or even use a dummy adapter that does nothing for testing. The system automatically creates and manages the storage instances, and handles reading and writing signals safely, even if the application crashes.

The `readScheduleData` function gets an existing scheduled signal from storage, while `writeScheduleData` saves a new one, or removes an existing one. The `clear` function lets you wipe the stored data if the environment changes. `usePersistScheduleAdapter`, `useJson`, and `useDummy` provide ways to switch between different persistence methods.

## Class PersistScheduleInstance

This class, `PersistScheduleInstance`, helps manage and save scheduled trading signals to a file. It's designed to be reliable, even if your program crashes unexpectedly.

It keeps track of signals based on a combination of the trading symbol, strategy name, and exchange name, storing them in a specific file.

Here's what you can do with it:

*   You can initialize the file storage it uses.
*   Retrieve a previously saved signal for a specific symbol.
*   Save a new signal or delete an existing one by setting it to null.
*   It makes sure data is written safely to avoid corruption if something goes wrong during the process.


## Class PersistRiskUtils

This class helps manage how active trading positions are saved and retrieved, specifically ensuring their reliability. It keeps track of these positions separately for each risk profile, using a system that remembers which storage method is in use.

The framework intelligently creates storage instances only when needed, and it uses a special technique to prevent data loss even if something unexpected happens.

You can customize how positions are saved by providing your own storage method.

There's a way to clear out the existing storage methods, which is useful when restarting a strategy or changing the environment.

It provides options to switch to a default file-based storage or a dummy storage for testing purposes, where no data is actually saved.


## Class PersistRiskInstance

This class provides a way to reliably save and load position data to a file, ensuring your backtesting results aren't lost due to unexpected interruptions. It’s designed specifically to manage risk data related to a particular risk name and exchange.

It automatically handles the underlying file storage, making it easy to persist your trading data. The data is stored using a predefined key, ensuring consistency.

To get started, you create an instance of this class with the risk name and exchange name. The `waitForInit` method prepares the storage, while `readPositionData` retrieves saved data, and `writePositionData` saves new data. This system is built to be crash-safe, meaning your data is protected even if your program encounters problems.


## Class PersistRecentUtils

This class helps manage how recent trading signals are stored and retrieved, making sure the process is reliable even if things go wrong. It cleverly avoids creating the same storage repeatedly for the same trading setup (symbol, strategy, exchange, and timeframe) by remembering what it’s already created. 

You can customize how the signals are stored, choosing between different storage methods like file-based storage or even a dummy option for testing. 

The `readRecentData` and `writeRecentData` methods are used to get and save those signals, automatically setting up the storage the first time they're used.

If you need to change how storage is handled, like when your working directory changes, you can clear the cache.  You can also easily switch between different storage adapters to suit your needs.

## Class PersistRecentInstance

This class helps you save and retrieve the most recent trading signal data for a specific strategy, exchange, and timeframe. It essentially acts as a persistent memory for your backtest or live trading system.

The class stores information like the trading symbol, strategy name, exchange name, timeframe, and whether it's a backtest or live run to uniquely identify the data it manages. It automatically handles saving the data to a file in a safe way, making sure no data is lost.

You can use it to load the latest signal data that was previously saved, and to save the current signal data so you can check it later. This helps to maintain consistency and track how your strategy performs over time. The initialization process makes sure the storage is ready before you start reading or writing data.


## Class PersistPartialUtils

This utility class helps manage and safely store partial profit and loss data for your trading strategies. It ensures that data related to each symbol and strategy is stored and retrieved consistently, even if there are interruptions. It uses a clever system to create and manage these storage instances, making sure each strategy’s data is kept separate and secure.

You can customize how this data is stored by providing your own way of creating these storage instances, or you can use the built-in file-based or dummy options.  The class automatically handles reading and writing data, and it has a mechanism to refresh this data if the working directory changes. Essentially, it’s designed to reliably keep track of your partial profits and losses throughout the backtesting process.

## Class PersistPartialInstance

This class helps you save and retrieve incomplete trading data, like intermediate results from a backtest, to a file. It's designed to be reliable, ensuring data isn't lost even if something goes wrong during the process. 

It essentially manages a storage area specific to your trading symbol, strategy, and exchange, using the signal ID as a unique identifier for each piece of data. The class makes sure those saves happen in a way that avoids corruption.

Here’s a breakdown of how it works:

*   **Initialization:** You start by setting up the storage area, ensuring it's ready for saving data.
*   **Saving Partial Data:**  The `writePartialData` method lets you store incomplete pieces of data, identified by a signal ID. Think of it as checkpoints during your backtest.
*   **Retrieving Partial Data:** The `readPartialData` method allows you to load those saved pieces of data later, using the same signal ID.

The class takes the trading symbol, strategy name, and exchange name during its setup to organize storage. It also uses an internal mechanism, `_storage`, to handle the actual file writing.

## Class PersistNotificationUtils

This class provides tools for handling how notification data is saved and retrieved, ensuring it's done reliably and efficiently. It's a behind-the-scenes helper used by other components for managing persistent notification information.

Think of it as a central place to control how notifications are stored, allowing for flexibility in the storage method used. You can even swap out the storage mechanism entirely if needed.

It cleverly keeps track of storage instances to avoid unnecessary creation, and it makes sure that writing and reading notification data is handled carefully. Each notification is stored as its own file, identified by a unique ID. 

If the environment changes, like when the working directory updates, you can clear the internal caches to ensure everything refreshes properly. There's also a handy way to switch to a dummy storage for testing – it won't actually save anything in that case.

## Class PersistNotificationInstance

This component handles saving and retrieving notifications, acting as a persistent storage layer for your application. It's designed to be reliable, even if the application crashes unexpectedly. Notifications are stored as individual JSON files, each identified by a unique ID.

The storage uses file-based persistence, meaning data is saved directly to disk. You can control whether the storage is used in a backtesting environment during construction. 

The `waitForInit` method ensures the storage is properly initialized before you try to use it.  Retrieving all notifications involves reading through the keys present in the storage. Writing notifications saves each one individually using its ID.

## Class PersistMemoryUtils

This class provides tools for managing how memory data is saved and loaded persistently. It intelligently handles different storage configurations, allowing you to customize how data is stored while ensuring a consistent process.

Think of it as a helper for keeping track of data across program restarts or updates.

Here's a breakdown of what it does:

*   It creates storage areas for your data, organized by a signal ID and bucket name.
*   You can swap out the default storage method with your own, or use a dummy version for testing.
*   It provides functions to read, write, delete, and check for the existence of stored memory entries.
*   It offers a way to clear the storage cache when needed, like when the program's working directory changes.
*   It allows you to iterate over all stored data entries, which is helpful for rebuilding indexes.
*   Finally, it has methods to clean up storage when a signal is removed.

## Class PersistMemoryInstance

This class provides a way to store and retrieve data persistently, like saving information to a file. It's designed to work with the backtest-kit framework and helps manage data related to a specific signal and bucket.

The class handles saving data to a file, ensuring that changes are saved reliably. It allows you to mark data as deleted without actually removing it from the storage, offering a way to effectively hide data. When you need to see all the stored data, you can retrieve it in a list, but entries marked as deleted will be excluded.

The `waitForInit` method gets things ready for writing data. `readMemoryData` lets you fetch specific pieces of data based on their ID, and `hasMemoryData` quickly checks if a piece of data exists.  You can write new data using `writeMemoryData`, and `removeMemoryData` provides a way to logically remove data by marking it as deleted. The `dispose` function doesn't need to do anything itself, because another component handles clearing any related caches.

## Class PersistMeasureUtils

This utility class helps manage how trading data retrieved from external sources is stored persistently, ensuring it's readily available for backtesting. It acts as a central point for handling cached data, organizing it based on a combination of time and the specific asset being traded. 

You can customize how this data is stored by providing your own storage mechanisms. The system remembers which storage method is in use for each data set, creating instances only when needed. 

Functions are provided to read, write, and delete data from these persistent stores. It also offers methods to clear the stored instances and to switch between different storage options, including a default file-based method and a dummy method that doesn’t actually save anything, useful for testing. The class also handles situations where the working directory changes between strategy runs.

## Class PersistMeasureInstance

This class provides a way to store and retrieve measure data, essentially acting as a persistent storage layer for your backtesting framework. It uses files to save this data, ensuring that it's not lost when your application closes.

The class wraps around a more basic storage mechanism to handle saving data safely and reliably.  It also supports a "soft delete" feature, where data isn't actually erased but marked as removed – allowing you to potentially recover it later. When you list all available data, this class will automatically exclude the entries that have been "soft-deleted."

You can think of the `bucket` property as a folder where your data is organized. 

The `waitForInit` method makes sure the underlying storage is ready before you start writing anything.

To retrieve a specific measure entry, use `readMeasureData`, providing a unique key. Writing new data or updating existing data is done with `writeMeasureData`. If you need to remove data, `removeMeasureData` handles it using the soft-delete approach. Finally, `listMeasureData` lets you get a list of all valid (non-removed) data entries, giving you a snapshot of the current data.

## Class PersistLogUtils

This class helps manage how log data is saved and loaded, ensuring a reliable system for tracking activity. It uses a single, cached instance of a log manager, which can be swapped out for different storage methods.

You can customize how the log data is stored by providing your own log instance constructor. This lets you experiment with different storage solutions or integrate with external systems.

The `readLogData` function retrieves all of the saved log entries, while `writeLogData` adds new entries – it’s designed to avoid duplicates based on their unique identifiers.  The system makes sure that reading and writing operations are handled carefully and safely.

If you need to completely refresh the log storage, you can clear the cached instance or switch back to the default file-based storage or even a dummy (no-op) version for testing. These utility functions are specifically designed to be used alongside `LogPersistUtils` for managing your logs.

## Class PersistLogInstance

This class provides a way to persistently store trading logs to files, ensuring data isn't lost even if there are interruptions. It's like having a digital journal for your backtesting, where each entry is saved as a separate file. The system works by adding new log entries one at a time, so it’s append-only – you can't go back and change anything that’s already been written.

To get started, the storage needs to be initialized. It then retrieves all the log entries by looking at the list of files it manages. When you add new data, it carefully checks to make sure you're not trying to overwrite existing log entries. It’s designed to be reliable, even if unexpected issues occur during the writing process. 

Essentially, this component takes care of the tedious task of saving your trading logs safely and consistently.


## Class PersistIntervalUtils

This component manages persistence for interval-based signals, essentially keeping track of which intervals have already fired. It stores this information in files located under a `./dump/data/interval/` directory. A file's existence indicates the interval has already occurred; its absence means it hasn't.

You can customize how this persistence works by swapping out the default persistence mechanism. For example, you could use a JSON file, a dummy instance that does nothing, or supply your own custom constructor.

The framework offers functions to read, write, and delete these interval markers. It also provides a way to list all non-deleted markers within a specific interval bucket.  Finally, you can clear the internal cache if the working directory changes during the backtesting process, ensuring data consistency.

## Class PersistIntervalInstance

This component provides a way to store and manage trading interval data using files. It essentially acts as a persistent layer, ensuring your data survives between runs.

The data is organized into a "bucket," which is essentially a folder where the files are stored.

You can read, write, and delete interval data using straightforward methods like `readIntervalData`, `writeIntervalData`, and `removeIntervalData`. Importantly, deleting data is a "soft delete" – the file isn't actually removed, but marked as deleted, allowing you to potentially recover it later or prevent the interval from firing. 

The `listIntervalData` function gives you a way to see which intervals currently have data associated with them, excluding those that have been marked for deletion. 

Before you start using it, you need to initialize the storage using `waitForInit`.

## Class PersistCandleUtils

This class helps manage a cache of historical candle data, storing each candle as a separate file for easy access and organization. It's designed to work with ClientExchange to efficiently manage and reuse candle data, preventing unnecessary re-downloads. The system checks if the cached data is complete before using it and automatically updates the cache when needed.

You can customize how the candle cache is implemented by providing your own constructor for the cache instances. This lets you experiment with different storage methods or testing scenarios.

Here's a breakdown of what you can do:

*   **Read Cached Data:** The `readCandlesData` method retrieves the cached candles within a specific time range. It ensures the cache is initialized automatically the first time you request data.
*   **Write Cached Data:** The `writeCandlesData` method saves candle data to the cache.
*   **Switch Adapters:** You can swap out the underlying cache implementation by using `usePersistCandleAdapter` to register a custom constructor, `useJson` to go back to the default file-based storage, or `useDummy` to use a dummy implementation that ignores writes and always returns null for reads (useful for testing).
*   **Clear Cache:** `clear` removes all existing cached instances, which is helpful when the working directory changes during strategy execution.



Essentially, this class provides a robust and flexible way to handle your cached candle data, allowing you to optimize performance and simplify your backtesting processes.

## Class PersistCandleInstance

This class helps you save and retrieve historical candle data, like open, high, low, and close prices for a specific trading symbol and time interval. It stores each candle as a separate file, making it easy to manage and access individual data points. 

If you try to read a candle that doesn't exist, it will return null, which signals that you need to fetch that data again.  

When writing new candles, it makes sure only complete candles (those with a closing time in the past) are saved and it won't overwrite existing data. If a candle is found to be invalid, it’ll alert you and treat it as if it wasn’t there.

The system uses the symbol, interval, and exchange name to organize the stored files.  You can also use `waitForInit` to ensure the underlying storage is ready before reading or writing data. The `_storage` property is the internal mechanism used for file-based storage.


## Class PersistBreakevenUtils

This class manages how your breakeven data—the information needed to track when a trade has reached its breakeven point—is saved and loaded. It ensures that this data is persistent, meaning it's stored so it doesn't disappear when your trading strategy restarts.

Think of it as a central place to handle this data, making sure it’s saved reliably to files.

It uses a clever system to only create the data storage mechanism when it’s actually needed, and it remembers which storage to use for different trading symbols and strategies, preventing redundant creation.

You can even customize how the data is saved, choosing between a standard file-based approach, or a dummy option for testing when you don't want data to actually be saved to disk.

If you need to switch the way your data is saved, for example if your working directory changes during a trading session, there are functions to clear the memory and reset the saving mechanism.

## Class PersistBreakevenInstance

This class provides a way to reliably store and retrieve breakeven data, acting as a persistent layer for your trading strategies. It's designed to be crash-safe, ensuring your data isn't lost even if things go wrong.

It uses a file on your system to keep track of the data, organized by the symbol, strategy, and exchange it relates to. Each piece of data is identified by a unique signal ID.

The `waitForInit` method prepares the storage area, while `readBreakevenData` fetches existing data based on a signal ID and timestamp, and `writeBreakevenData` saves new or updated data. Think of it as a secure way to remember important calculations for your strategies, keeping them consistent across sessions.

## Class PersistBase

This class, `PersistBase`, provides a foundation for reliably storing and retrieving data to files. It’s designed to handle file operations safely, ensuring that writes are atomic – meaning they either fully succeed or don't happen at all, preventing data corruption. 

It automatically checks for and cleans up any damaged files, and it keeps track of where your data is stored based on the entity name you provide. You can easily loop through all the entities you’ve stored using an asynchronous generator.

The constructor takes an entity name and a base directory for storage. 

It includes a computed property `_directory` that automatically figures out the correct location for your entity files. 

The `waitForInit` method sets up the storage directory initially and verifies the integrity of existing files, ensuring everything is in working order.

`readValue` fetches a specific entity from storage, `hasValue` checks if an entity exists, and `writeValue` saves an entity – using those atomic write operations to keep your data secure. The `keys` method allows you to iterate through all stored entity IDs in a sorted order.


## Class PerformanceReportService

This service helps you understand how long different parts of your trading strategies take to execute. It works by listening for timing events – moments when certain actions happen – and recording how long they take, along with some extra details. 

Think of it as a performance detective, keeping track of where your code might be slow.

You can tell it to start listening for these events and it will automatically store that information in a database for later analysis.

If you need to stop it from listening, there’s a way to do that too, ensuring you don't accidentally subscribe multiple times. It uses a safe mechanism to prevent duplicate subscriptions.


## Class PerformanceMarkdownService

This service helps you keep track of how your trading strategies are performing. It listens for performance data, organizes it by strategy, and calculates important statistics like averages, minimums, maximums, and percentiles. 

You can use it to generate detailed reports in Markdown format, which includes analysis of potential bottlenecks. These reports are saved to your logs directory, making it easy to review your strategy's performance over time.

The service keeps data isolated for each unique combination of symbol, strategy, exchange, frame, and backtest, ensuring accurate analysis. It also includes methods to easily subscribe to and unsubscribe from performance events, clear accumulated data, and retrieve performance statistics for specific strategies.

## Class Performance

The Performance class helps you understand how well your trading strategies are doing. It lets you gather performance statistics for specific symbols and strategies, providing a detailed breakdown of metrics like execution time, volatility, and percentiles to highlight potential bottlenecks. You can also generate easy-to-read markdown reports summarizing these findings, and these reports can be saved directly to your computer. Think of it as a toolkit for analyzing and optimizing your backtesting results. 

The `getData` method pulls together all those performance numbers for a given strategy and symbol. 

The `getReport` method creates a well-formatted markdown report.

The `dump` method allows you to save this report to a file, making it simple to share or track your progress over time.


## Class PartialUtils

PartialUtils helps you analyze and understand partial profit and loss data collected during trading. Think of it as a tool for examining how your strategies are performing, providing insights into smaller wins and losses that contribute to overall results.

It gathers information from events like when a profit or loss is triggered, storing details such as the symbol traded, the strategy used, the price, and the timestamp.

You can use PartialUtils to:

*   Get summarized statistics about your partial profit and loss events, like total counts.
*   Create easy-to-read markdown reports that display these events in a table format, showing key details for each transaction.
*   Save these detailed reports directly to files for later review and analysis.

The reports include a table showing each profit and loss, and a summary at the bottom. You can also customize which columns are shown.

The tool automatically organizes your reports into files named after the symbol and strategy used, making it simple to track performance for each strategy. It’s like creating a detailed trading log that you can easily share or keep for your records.

## Class PartialReportService

The PartialReportService helps you keep track of when your trading positions are partially closed, whether it's for a profit or a loss. It acts like a recorder, specifically logging these "partial exit" events – the price and level at which the position was closed.

Think of it as listening for signals – it listens for notifications about profits and losses occurring during a trade. 

To use it, you subscribe to receive these signals, and when you're done, you unsubscribe. The service automatically prevents you from accidentally subscribing multiple times.

The service also utilizes a logger to provide debugging information.


## Class PartialMarkdownService

This service helps you create and save reports detailing your partial profits and losses during trading. It listens for events indicating profit or loss and keeps track of them for each symbol and strategy you're using. It then organizes this information into easy-to-read markdown tables, providing statistics like the total number of profit and loss events.

You can subscribe to receive these events, and the service will accumulate data until you’re ready to generate a report. These reports are saved as markdown files on your disk, making it simple to review your trading performance. 

The service uses a unique storage system for each symbol and strategy combination, ensuring data isolation. You can get specific data or reports for a symbol-strategy pair or clear all accumulated data when needed. The dump function helps saving those reports to files.

## Class PartialGlobalService

This service acts as a central hub for managing and tracking partial profits and losses within the trading system. It simplifies how strategies interact with the underlying connection layer by providing a single point of injection and a layer of abstraction. Think of it as a middleman – it logs important actions before passing them on to the connection service, helping with monitoring and debugging.

It relies on several other services injected into it – a logger for recording activities, and services for validating strategies, risks, exchanges, and frames. 

The `profit`, `loss`, and `clear` functions handle the core logic of updating and emitting events related to partial profits, losses, and signal closures. Before performing any action, these functions log details at a global level and then delegate the actual work to the `PartialConnectionService`. The `validate` function streamlines the validation process, remembering previous validations to avoid unnecessary repetition.

## Class PartialConnectionService

The PartialConnectionService is a central component for managing and tracking partial profits and losses within the trading system. It acts like a smart factory, creating and managing individual "ClientPartial" objects for each unique trading signal. 

Think of it as a way to keep track of how a trade is performing, even if it's not fully resolved yet.

It cleverly caches these ClientPartial objects to avoid unnecessary creation, retrieving them when needed and cleaning them up when signals are closed. The service is designed to work seamlessly with other parts of the system, receiving configuration and delegating the actual profit/loss calculations to the ClientPartial objects. You'll find it plays a key role in how the system responds to changes in a trade's performance, ensuring timely updates and proper record keeping. It handles both profit and loss events, and also clears the state when a trade is finalized.

## Class NotificationLiveAdapter

This component provides a flexible way to send notifications during backtesting or live trading. It acts as a central hub, allowing you to easily swap out different notification methods without changing the core trading logic. 

It defaults to storing notifications in memory, which is great for quick testing. However, you can also switch to persistent storage (saving notifications to disk) or use a dummy adapter that does nothing – perfect for situations where you don't want any notifications at all.

The `handleSignal`, `handlePartialProfit`, `handlePartialLoss` and other `handle...` methods are the main entry points for triggering notifications based on different events happening during the trading process. They simply pass along the information to whichever notification method you've selected.

You can change which notification method is being used through the `useDummy`, `useMemory`, and `usePersist` functions. The `clear` method is important to call if the directory where notifications are stored changes between strategy runs, ensuring that a fresh notification instance is used.

## Class NotificationHelperService

This service helps manage and send out notifications about signals within the trading system. It's primarily used behind the scenes to ensure everything is working correctly and to keep users informed.

It validates the configuration of different parts of your trading strategy, like the strategy itself, the exchange you're using, and the data frames. The validation process is smart; it only runs once for each unique combination of strategy, exchange, and frame, speeding things up.

The `commitSignalNotify` function is the main way this service is used. It bundles all the validation steps together and then sends out a notification when a signal is ready to be processed. This notification contains details about the signal, and it's delivered to anyone who's signed up to receive them, while also being saved for record-keeping. Essentially, it's a central point for keeping track of and communicating about important events in the trading process.


## Class NotificationBacktestAdapter

This component helps you manage notifications during backtesting, offering flexibility in how those notifications are handled. It acts as a central point for sending out various events like trade signals, profit/loss updates, errors, and more.

You can easily swap out the underlying notification system – whether you want to store notifications in memory, persist them to disk, or simply discard them (using a dummy adapter). The default behavior is to store notifications in memory.

The `handleSignal`, `handlePartialProfit`, `handleRisk`, `handleError`, and other similarly named methods are how you send out notifications. These methods simply pass the data on to the currently configured adapter.

The `useNotificationAdapter` method allows you to specify exactly which class should be used to generate the notification utilities. You can use `useDummy`, `useMemory`, or `usePersist` as shortcuts to quickly switch between different storage options.

The `clear` method is especially important if your backtesting process changes its working directory between strategy runs; it forces a refresh of the notification utilities. Finally, the `getData` function allows you to retrieve all notifications collected.


## Class NotificationAdapter

This component, the NotificationAdapter, acts as a central hub for managing notifications during both backtesting and live trading. It automatically receives and stores notifications triggered by various events, such as trade signals, profit/loss updates, and error messages. 

To prevent unnecessary subscriptions, it utilizes a "singleshot" mechanism, ensuring that each notification source is subscribed to only once. 

You can retrieve all stored notifications, specifying whether you want the backtest or live data. 

It also includes a cleanup function to properly unsubscribe from all signal emitters when you’re finished with it. The `enable` property is used to subscribe to these signal emitters, and `disable` allows you to unsubscribe.


## Class MemoryLiveAdapter

This component helps manage live trading memory, allowing you to choose different storage methods. It acts as a central point for interacting with memory, offering flexibility through a pattern that lets you swap out how memory is stored.

By default, it uses file-based storage, which means your data is saved and reloaded even if the application restarts. However, you can easily change this to use in-memory storage for faster access or a dummy storage that simply discards any data written.

It provides methods for writing data to memory, searching for existing data using full-text search, listing all entries, removing data, and retrieving single entries. The `disposeSignal` function is crucial for cleaning up memory when a trading signal is no longer active. 

You can also customize the memory storage by providing your own implementation. Don't forget to clear the cache if the base path changes, ensuring that new instances are created correctly.

## Class MemoryBacktestAdapter

The `MemoryBacktestAdapter` provides a flexible way to manage memory storage during backtesting. It acts as a central point for accessing and manipulating memory, allowing you to easily swap out different storage methods. By default, it uses an in-memory system (MemoryLocalInstance) for speed and simplicity.

You can choose between several storage options: a persistent file-based adapter, a dummy adapter for testing, or even create your own custom adapter. Data is organized by signal ID and bucket name, and efficiently stored using memoization for faster access.

The `disposeSignal` function is important for cleaning up memory when a signal is cancelled, ensuring that resources are released. You can write data to memory, search it using BM25 for full-text scoring, list all entries, remove specific entries, and read individual entries. The `useLocal`, `usePersist`, `useDummy`, and `useMemoryAdapter` methods let you switch between different storage strategies quickly. Finally, the `clear` function is helpful to avoid issues with changing working directories between backtest iterations.

## Class MemoryAdapter

The MemoryAdapter is the central component for managing how your backtests and live trading systems store and retrieve data. Think of it as a traffic controller, directing memory-related operations to the correct place – either a backtest environment or a live trading system.

It’s designed to automatically clean up after itself, preventing memory leaks by ensuring resources are released when signals are no longer needed.

Here's a breakdown of what you can do with it:

*   **Enable/Disable:** It offers simple methods to turn memory storage on or off. When enabled, it subscribes to signal lifecycle events for automatic cleanup.
*   **Write Data:** You can easily store data by providing details like a unique ID, the data itself, and a timestamp.
*   **Search Data:** The adapter allows you to search your memory data using a powerful full-text search engine (BM25).
*   **List Data:** You can retrieve a list of all the data entries.
*   **Remove Data:** You can delete specific data entries when they're no longer needed.
*   **Read Data:** You can fetch a single data entry by its ID.

The adapter handles the underlying complexities of interacting with either the backtest or live memory storage based on your configuration.

## Class MaxDrawdownUtils

This class offers tools for analyzing and understanding maximum drawdown events, which represent significant losses in trading. Think of it as a way to review the worst performance periods for your strategies.

It doesn't create new instances; instead, it provides static-like functions to access pre-calculated data gathered during backtesting or live trading.

You can use this class to:

*   Get detailed statistics about maximum drawdowns for a specific trading strategy and symbol.
*   Create a markdown report summarizing all recorded drawdown events, helpful for detailed analysis.
*   Save that markdown report directly to a file for easier sharing or archiving.

Essentially, it helps you understand and document the potential downside risk associated with your trading strategies.

## Class MaxDrawdownReportService

The MaxDrawdownReportService is responsible for tracking and recording maximum drawdown events. It essentially listens for these drawdown events and saves them to a database for later analysis.

Think of it as a data logger specifically for significant drawdown occurrences during backtesting.

Here's how it works:

It has a built-in `subscribe` method that you use to start the process - it makes sure you don't accidentally subscribe multiple times. The `unsubscribe` method is what you use to stop the service and prevent further logging.

When a drawdown event happens, the service captures detailed information about the trade that triggered it, including timestamps, symbol, strategy and signal details, position information, and price points. This data is then written to a JSONL file. 

It's designed to record everything needed to understand what happened when a new drawdown occurred.

## Class MaxDrawdownMarkdownService

This service is designed to automatically create and save reports detailing the maximum drawdown experienced during backtesting. It listens for drawdown events and organizes them by symbol, strategy, exchange, and timeframe.

You can subscribe to receive these drawdown events, and conversely, unsubscribe to stop receiving them and clear any stored data. The service provides ways to retrieve the raw drawdown data, generate a formatted markdown report, or directly write the report to a file. 

The `clear` function allows you to remove this accumulated data – either specific to a particular symbol, strategy, exchange, and timeframe combination, or a complete wipe of all stored data.

## Class MarkdownWriterAdapter

The MarkdownWriterAdapter helps you manage how your trading reports are saved. It uses a flexible design allowing you to easily switch between different storage methods like writing each report to its own file, combining reports into a single JSONL file, or disabling markdown output entirely. 

It remembers which storage method you're using, preventing unnecessary creation of multiple storage instances.

You can change the default storage method used, like switching from individual files to a single combined file. 

The `writeData` method takes the content and writes it using the current method.

Here are some quick ways to control how your data is saved:

*   `useMd()`: Stores each report in its own .md file (the default).
*   `useJsonl()`: Combines all reports into a single, append-only .jsonl file.
*   `useDummy()`: Silences all markdown output.

If you change the working directory during a strategy iteration, you may need to clear the cache to ensure fresh storage instances are created.

## Class MarkdownUtils

MarkdownUtils helps manage the creation of markdown reports for different parts of your trading framework, like backtesting, live trading, and performance analysis.

You can turn on (enable) these report services individually, and it’s really important to remember to unsubscribe from them when you’re done to avoid issues. Enabling a service means it will start collecting data and generating reports.

Alternatively, you can turn off (disable) specific report services without affecting others, which is useful if you only need certain reports at certain times.  Disabling stops the data collection and report generation immediately.

Finally, you can clear the data that a specific report service has accumulated without turning it off completely – essentially resetting the data for a fresh start.

## Class MarkdownFolderBase

This adapter lets you generate your backtest reports as individual markdown files, neatly organized into directories. Think of it as a way to create a folder full of readable reports, perfect for manual examination.

It essentially writes each report directly to a file, using a path you define, so there's no need to worry about managing streams.  The adapter handles creating the necessary directories for you.

The `waitForInit` method doesn't do anything, because this type of adapter doesn't require any special setup.

The key method is `dump`, which takes your markdown content and writes it to a file, automatically creating the necessary directory structure and filename based on your settings. This will give you reports like "BTCUSDT_my-strategy_binance_2024-Q1_backtest-1736601234567.md" within a directory you specify.

## Class MarkdownFileBase

This component handles writing markdown reports to files in a structured JSONL format, making them easily processable by other tools. It creates a single JSONL file for each type of markdown report, like performance summaries or order book snapshots.

The adapter focuses on reliable, append-only writing with built-in safeguards. It uses a stream-based approach to manage data flow efficiently and includes a timeout to prevent writes from getting stuck. If a write takes too long, it will return an error signal. 

It organizes these markdown files into a designated directory, automatically creating it if needed. To help with filtering and analysis, each line in the JSONL file includes metadata like the trading symbol, strategy name, exchange, timeframe, and signal ID.

You can think of it as a centralized logging system for markdown reports, all neatly organized and ready for further processing. The initialization process only happens once, ensuring consistent file setup. Finally, you use the `dump` method to add new markdown content to the file, including the data itself alongside relevant metadata.

## Class MarkdownAdapter

The MarkdownAdapter helps you manage how your markdown data is stored, offering flexibility and efficiency. It acts as a central point, letting you choose different ways to handle markdown files without changing your core code. 

You can easily switch between storing markdown as separate files (.md) or appending to a single JSONL file. 

The adapter also cleverly remembers which storage method you're using, so you don't have to recreate the storage objects repeatedly.

It's designed to be simple to use; functions like `useMd`, `useJsonl`, and `useDummy` provide shortcuts to common configurations.  The `useDummy` option is useful for testing and development when you don't want to actually save data. Finally, you have the power to define your own custom storage methods if the built-in options don't quite fit your needs.

## Class LookupUtils

The LookupUtils acts as a central record of what's currently happening during backtests and live trading. Think of it as a log of ongoing activities, such as a backtest run or a strategy iteration.

Whenever a backtest starts or a live trading session begins, an entry is added to this log. When those processes finish, the entry is removed.

This system is designed to help manage resources efficiently, especially when dealing with multiple, potentially parallel, tasks. It helps to determine if certain optimizations, like handing off control to another process, are worthwhile.

You can't create a new instance of this system; it’s a singleton, always available as `Lookup`.

Here's what it allows you to do:

*   **Add an Activity:** Register a new activity (like a backtest or live session) into the log. If you try to register the same activity twice, it simply updates the existing entry.
*   **Remove an Activity:** Remove a previously registered activity.  It's important to always pair this with adding the activity, often using a `finally` block to ensure the activity is removed even if errors occur.
*   **List Activities:** Get a snapshot of all the currently active activities.



The system uses an internal map (`_lookupMap`) to manage these activity entries.

## Class LoggerService

The LoggerService helps ensure consistent logging across your backtesting framework by automatically adding relevant information to each log message. It’s designed to work with a logger you provide, enriching its output with details like the strategy name, exchange, and the specific part of the code being executed. 

If you don't specify a custom logger, it defaults to a "do nothing" logger, so it won’t interfere with your application's functionality. The service uses two internal services for managing method and execution contexts, making the logging process streamlined and informative. 

You can customize the logging behavior by setting your own logger through the `setLogger` method. This gives you flexibility in how and where your logs are stored or displayed. It provides several methods – `log`, `debug`, `info`, and `warn` – allowing you to categorize your logs by severity.

## Class LogAdapter

The `LogAdapter` provides a flexible way to manage logging within your backtesting framework. It lets you easily swap out different logging methods – like storing logs in memory, on disk, or even silencing them entirely. The default logging method stores everything in memory, but you can quickly switch to persistent storage for later analysis, or use a dummy logger to prevent any logging during testing.

It's designed so that changing how logs are handled doesn't require complex code modifications; you simply choose the logging method you need. 

The `getInstance` property intelligently creates the log instance only when it's needed and keeps it cached for efficiency, but can be reset to ensure fresh instances when the working directory changes.

Methods like `log`, `debug`, `info`, `warn`, and `getList` all pass through to the currently selected logging method, providing a consistent interface for your logging needs. You can use `useLogger` to completely define your own custom log adapter. `clear` forces the framework to regenerate the logging instance.

## Class LiveUtils

This class provides tools for live trading, simplifying the process and handling potential issues. It acts as a central hub for live operations, offering features like automatic restarts after crashes and real-time progress tracking.

Here's a breakdown of what you can do with it:

*   **Run Live Trades:** Initiate and manage live trading for a specific symbol and strategy, with built-in recovery from crashes. It can also run background trades without directly reporting results.
*   **Get Signal Information:** Retrieve details about pending and scheduled signals, like current status, and whether signals are present.
*   **Monitor Position:** Access key details about an active position, including cost basis, percentage held, breakeven point, entry prices, profit/loss, and estimated time to completion.
*   **Manage Position:** Modify the position by executing partial profits/losses, adjusting stop-loss and take-profit levels, and adding new DCA entries.
*   **Control Trading:** Stop the trading process or early activate scheduled trades.
*   **Generate Reports:** Create detailed reports and statistics about trading activity, including performance metrics and historical events.
*   **Get Statistics:** Retrieve live statistics for the live trading operation.
*   **List Instances:** View a list of currently active live trading instances and their states.



The `LiveUtils` class uses a singleton pattern, making it easily accessible throughout your application.

## Class LiveReportService

LiveReportService helps you track what your trading strategy is doing in real-time by recording every signal event—when it’s idle, when a position is opened, when it's active, and when it's closed.

It connects to your live signal events and carefully logs each tick, storing all the details in a database so you can monitor and analyze performance.

To ensure you don't accidentally subscribe multiple times, it uses a mechanism to prevent duplicate connections.

You'll use the `subscribe` method to start receiving these live events, and it will give you a way to stop listening later.  The `unsubscribe` method is how you stop receiving those events. If you haven't subscribed, this method does nothing.

It has a built-in logger to help you debug any issues that arise.


## Class LiveMarkdownService

This service automatically creates and saves markdown reports as your trading strategies run live. It keeps track of all the events happening during trading – when a strategy is idle, when it opens a position, when it's active, and when it closes – storing this information for each strategy.

The service listens for signals from your trading system and uses them to build detailed markdown tables that summarize these events. You’ll find valuable statistics included as well, like your win rate and average profit/loss.

These reports are automatically saved to your computer, within the `logs/live/{strategyName}.md` directory.

Here's a breakdown of how it works:

*   **Subscription:** It connects to your trading system to receive real-time updates.
*   **Data Storage:** It uses a clever system to organize trading data, ensuring each strategy’s information is kept separate.
*   **Report Generation:** It takes this collected data and transforms it into readable markdown reports.
*   **Saving Reports:** The reports are then saved to disk for later review.
*   **Clearing Data:** You can clear out the accumulated data if you want to start fresh, either for a specific strategy or for all strategies.

You can also retrieve specific data or reports programmatically if needed.

## Class LiveLogicPublicService

LiveLogicPublicService helps manage and orchestrate live trading, simplifying the process by automatically handling context information like the strategy and exchange being used. 

It essentially acts as a bridge, making it easier to use functions like getting candle data or generating trading signals because you don't have to explicitly pass context details everywhere.

Think of it as an ongoing process that continuously runs, offering a stream of trading results (signals to open, close, or cancel positions) and designed to be resilient – if it crashes, it can recover its state.

The service relies on other components like a logger and a connection to the exchange, and uses persisted state to handle recovery.

You initiate the live trading process for a specific symbol using the `run` method, which returns an infinite generator that produces the trading results.


## Class LiveLogicPrivateService

This service handles the ongoing process of live trading, operating continuously in the background. It monitors market data and reacts to signals, recovering from crashes to ensure uninterrupted operation.

The service uses an asynchronous generator to stream results efficiently, only reporting when a trade is opened or closed – not during active or idle periods. It checks for new signals regularly, tracking the passage of time with each iteration.

Essentially, it's a robust and memory-friendly engine for running your trading strategies in real-time, automatically managing the complexities of live trading and recovery. The `run` method initiates this continuous process for a specified trading symbol.

## Class LiveCommandService

The LiveCommandService acts as a central hub for live trading operations within the backtest-kit framework. It provides a straightforward way to access and manage live trading functionality, simplifying integration for external components.

Think of it as a convenient bridge to the core live trading logic, ensuring dependencies are handled gracefully. 

It's designed to be injected into other parts of your application, promoting a modular and organized codebase.

Key components like logging, live logic, and various validation services (strategy, exchange, schema, risk, and action) are readily available through this service.

The `run` method is the main way to initiate live trading, allowing you to specify the symbol and relevant context (strategy and exchange names). It’s structured as an infinite generator that automatically handles interruptions and restarts, providing robust and continuous trading execution.

## Class IntervalUtils

The `IntervalUtils` class helps manage functions that should only run once within a specific time interval. It provides a way to control when these functions are executed, preventing them from running too frequently. 

You can use it in two ways: in-memory, where the state is lost when the process restarts, or with persistent file storage, where the information about when a function last ran is saved to disk. This file-based approach ensures that the function only runs once per interval, even if your application is restarted.

The `fn` property lets you wrap functions for in-memory control, while `file` provides the persistent file storage option.  Think of it as a smart way to ensure certain actions only happen at the designated times.

You can also clean up old instances with `dispose` and `clear` and reset the index counter using `resetCounter`, which is helpful when you’re switching between different working directories. Essentially, it gives you fine-grained control over the timing and persistence of your function executions.

## Class HighestProfitUtils

This class offers tools to examine and report on your highest profit trading events. Think of it as a way to easily pull together and analyze your best performing trades.

It provides methods to retrieve detailed statistics about those top-performing trades for a specific symbol, strategy, and trading context.

You can use it to generate formatted markdown reports, either directly into a string or saved as a file, showcasing the highest profit events. This allows for a clear, organized view of your best performing trades and potential areas for further investigation. 

The analysis considers whether it’s a backtest or live trading scenario. You can also customize which data points appear in the generated reports.

## Class HighestProfitReportService

This service is responsible for tracking and recording the highest profit events in your trading backtests. It acts as a listener, constantly monitoring for new profit records.

Each time a new highest profit is achieved, the service captures detailed information about the trade, including the timestamp, symbol, strategy name, exchange, frame, backtest details, signal ID, position, current price, and the prices used for opening, take profit, and stop loss.

This data is then written to a JSONL report database, allowing for later analysis and insights.

To begin tracking these highest profit records, you need to subscribe to the service.  It's designed to prevent accidental duplicate subscriptions – the first subscription starts the process, and any subsequent calls will simply return the unsubscribe function.

To stop recording, you can unsubscribe, which cleanly disconnects the service from the data stream.


## Class HighestProfitMarkdownService

This service helps create and store reports detailing the highest profit achieved. It listens for incoming data related to profit and organizes it by symbol, strategy, exchange, and timeframe.

You can subscribe to receive these profit events, but the system prevents repeated subscriptions, ensuring efficient operation. Unsubscribing completely clears out all collected data.

The `tick` function processes each incoming profit event, organizing it within the appropriate storage area.

To retrieve the accumulated data, you can request specific statistics for a given combination of symbol, strategy, exchange, and timeframe. If no data exists for that combination, it will return an empty report.

You can generate formatted reports, either as markdown strings or by saving them directly to a file with a descriptive name based on the symbol, strategy, exchange, and whether it’s a backtest.

Finally, the `clear` function allows you to reset the data, either for a specific combination or across the entire system, effectively starting fresh.

## Class HeatUtils

HeatUtils is a helpful tool for visualizing and understanding the performance of your trading strategies. It automatically gathers statistics for each symbol used by a strategy, providing a clear overview of how each one contributed to the overall results.

Think of it as a way to quickly see which symbols performed well and which didn’t, all presented in a readily understandable format.

You can request this data, get a nicely formatted report as a markdown table, or even save the report directly to a file. This simplifies the process of analyzing your portfolio's heatmaps and identifying areas for improvement. The tool aggregates information from all closed trades, so you'll see a complete picture of the strategy’s performance. The data is organized by symbol and includes key metrics like total profit/loss, Sharpe ratio, maximum drawdown, and the number of trades executed. You can even customize the columns displayed in the report and specify where to save it.

## Class HeatReportService

The HeatReportService helps you keep track of your trading activity by recording every time a signal closes, along with its profit and loss. It’s designed to collect this data across all your investments, giving you a broad view of your portfolio's performance. 

It listens for events related to closed signals and automatically saves this information to a database for later analysis and heatmap generation. 

You can easily set up this service to receive these signal events and, just as easily, stop it when you no longer need it. It prevents accidental double-subscriptions, so you won’t receive redundant data.




The service uses a logger to output debug information, and the `tick` property handles processing these signal events, specifically focusing on closed signals and ignoring others.

## Class HeatMarkdownService

The Heatmap Service helps you visualize and understand the performance of your trading strategies. It gathers data from your trading signals and organizes them into useful statistics.

Think of it as a central hub that collects information about your trades, breaking them down by symbol and strategy. You can see how each strategy is performing overall, and drill down to see individual symbol performance with metrics like total profit, Sharpe Ratio, and maximum drawdown.

It automatically creates markdown reports that summarize these results in a clear, table format, making it easy to share your results or quickly analyze them yourself. The service handles potential errors gracefully, avoiding crashes due to unusual data.

You subscribe to the service to receive updates about closed trades, and it efficiently stores this data using a clever system to avoid unnecessary duplication. If you need to clear the data, you can either wipe everything or just specific data sets. When you're finished, you can easily unsubscribe to stop receiving updates.

## Class FrameValidationService

The FrameValidationService helps you keep track of your trading timeframes (also called frames) and make sure they’re set up correctly. It's like a central control panel for your timeframes.

You use `addFrame` to register each timeframe you're using, providing a name and its configuration.

The `validate` function is crucial – it double-checks that a timeframe actually exists before you try to use it in your backtesting, preventing errors.

For quick access, the service remembers the results of its validations through a technique called memoization, making things faster.

Finally, `list` allows you to see all the timeframes you've registered, so you can get an overview of your setup.

## Class FrameSchemaService

The FrameSchemaService helps keep track of different frame schemas, acting as a central place to store and manage them. It uses a specialized system to ensure the schemas are stored in a safe and predictable way. 

You can add new schemas using `register()` and get existing ones back using `get()`. 

If a schema already exists, you can update parts of it using `override()`. 

Before a new frame schema is registered, `validateShallow` checks its basic structure to ensure it’s set up correctly, avoiding potential errors later on. 

This service relies on a logger for tracking its activities.


## Class FrameCoreService

FrameCoreService is a central piece that handles the creation of timeframes – those blocks of time your trading strategies operate on. It works closely with other services, like the connection service to fetch data and a validation service to ensure everything is correct. Think of it as the engine that provides the sequence of time periods needed to run a backtest.

Specifically, it’s responsible for creating arrays of dates representing the timeframe based on the symbol and frame name you specify. It's an internal component used by the main backtesting logic.

The service relies on a logger for recording events and a connection service for retrieving timeframe information.

## Class FrameConnectionService

The FrameConnectionService acts as a central hub for managing and accessing different trading frames. It intelligently directs requests to the correct ClientFrame based on the active method context, which essentially tells it which frame you're working with.

To speed things up, it remembers (caches) the ClientFrame instances it creates, so it doesn't have to recreate them every time you need them. This caching is a key part of how it works efficiently.

It handles the timeframe for backtesting, allowing you to specify a start and end date and a time interval to focus on particular periods. If you’re running in live mode, there’s no frame constraint – effectively, it’s operating without a specific frame applied.

The service relies on other services like the logger, schema, and method context services to function properly.

You can get a specific ClientFrame using the `getFrame` method, and you can retrieve the timeframe boundaries for a given symbol and frame name with `getTimeframe`.

## Class ExchangeValidationService

The ExchangeValidationService helps you keep track of your trading exchanges and make sure they're set up correctly. It acts like a central manager for your exchange configurations.

You can register new exchanges using the `addExchange()` method, which lets you define and store the details of each exchange. 

Before you start any trading operations, use `validate()` to confirm an exchange is properly registered – this prevents errors down the line.

To see all the exchanges you've registered, the `list()` method gives you a simple overview. 

The service also remembers validation results to make things faster and more efficient.

## Class ExchangeUtils

The `ExchangeUtils` class helps you interact with different cryptocurrency exchanges in a consistent way. It's designed to be a single, easy-to-use resource for common exchange-related tasks.

You can use it to retrieve historical price data (candles), calculate average prices, and get the latest closing prices. It also handles formatting trade quantities and prices according to each exchange's specific rules.

To get real-time or historical order book information and aggregated trade data, `ExchangeUtils` simplifies the process by handling the complexities behind the scenes.  The `getRawCandles` function gives you extra control over the candles you retrieve, especially useful for testing strategies and avoiding potential biases. Essentially, it takes care of the tricky details so you can focus on your trading logic.

## Class ExchangeSchemaService

The ExchangeSchemaService helps you keep track of and manage the details of different cryptocurrency exchanges within your backtest kit. 

It uses a special, type-safe storage system to ensure everything is consistent.

You can add new exchanges using the `addExchange` function, and find them later by their name using the `get` function.

Before an exchange is added, the `validateShallow` function checks that it has all the necessary information in the right format.

The `override` function lets you update existing exchange information with just the parts that have changed.

## Class ExchangeCoreService

The ExchangeCoreService acts as a central hub for interacting with exchanges, streamlining various operations within the trading framework. It’s designed to work behind the scenes, injecting crucial information like the trading symbol, timestamp, and backtest settings into each request.

It helps validate exchange configurations to ensure everything is set up correctly, avoiding repeated checks.

This service provides a range of functions to retrieve essential data, including historical and future candle data (when in backtest mode), average prices, and order book information. You can also get formatted price and quantity strings tailored to the specific trading context. The service also handles fetching aggregated trade data and retrieving raw candle data with flexible date and quantity constraints. Ultimately, it makes interacting with exchanges easier and more reliable, particularly during backtesting and live trading scenarios.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges. It intelligently directs requests to the correct exchange based on the currently selected exchange name. To improve performance, it remembers (caches) the connections to each exchange, so it doesn't have to recreate them every time you need to use them.

This service provides a consistent way to retrieve data like historical candles, average prices, order books, and aggregated trades. When performing backtests, it calculates averages using existing historical data. In live trading scenarios, it fetches real-time data directly from the exchange.

You can request candles, get the next batch of candles based on the current timestamp, calculate the average price, get the closing price of a candle, format prices and quantities according to each exchange’s specific rules, retrieve order book information, and fetch aggregated trade data. This service handles all the complexities of communicating with different exchanges and ensures the data you receive is formatted correctly. The ability to retrieve raw candles gives even more flexibility for custom data fetching.

## Class DumpAdapter

The DumpAdapter helps you save data from your backtest runs in different formats. It acts as a central point for saving information like agent messages, records, tables, text, errors, and JSON objects.

Initially, it saves data as markdown files, creating a new one for each specific dump. You can easily change how the data is stored by switching to a memory-based backend (which stores the data in memory), a dummy backend (which discards the data), or even providing your own custom backend.

Before you start dumping data, you need to activate the adapter, and deactivate it when you're done, to ensure it's properly listening for signal events and preventing memory leaks. The `clear` function is useful if you’re changing the directory where your backtests are run.

## Class ConstantUtils

This class provides a set of predefined constants that help automate your trading strategies, specifically when it comes to setting take-profit and stop-loss levels. These constants are based on the Kelly Criterion and incorporate an exponential risk decay, a sophisticated approach to managing risk and maximizing potential profit.

The constants represent percentages of the total distance to your final take-profit or stop-loss target. For example, TP_LEVEL1 triggers when the price reaches 30% of the way to your final take-profit, allowing you to secure a portion of your gains early on.

Here's a breakdown of each constant:

*   **TP_LEVEL1 (30):**  A first take-profit target, capturing a small portion of potential profit.
*   **TP_LEVEL2 (60):** A second take-profit, securing a larger amount of the potential profit.
*   **TP_LEVEL3 (90):** A final take-profit level, locking in most of the potential profit while leaving a small amount to run.
*   **SL_LEVEL1 (40):** An initial stop-loss, acting as a warning sign that the trade setup might be weakening.
*   **SL_LEVEL2 (80):** A final stop-loss level, designed to protect against significant losses.

## Class ConfigValidationService

The ConfigValidationService helps make sure your trading configurations are set up correctly and have a chance to be profitable. It checks a lot of things about your settings, like ensuring percentages like slippage and fees aren't negative.

It verifies that your take-profit distance is set high enough to cover all the costs of a trade, including slippage and fees. The service also makes sure that minimum and maximum values for things like stop-loss distances make sense.

Finally, it confirms that time-related settings like timeouts and candle request parameters are using positive numbers. Essentially, this service acts as a safety net to catch potential errors in your configurations before you start trading.

## Class ColumnValidationService

The ColumnValidationService helps make sure your column configurations are set up correctly. It acts as a safety net, double-checking that each column definition follows the rules outlined in the ColumnModel interface.

It verifies several things: that essential properties like 'key', 'label', 'format', and 'isVisible' are present; that 'key' and 'label' are strings and aren't blank; that 'format' and 'isVisible' are actually functions you can use; and that the 'key' values don’t overlap within groups of columns. 

Essentially, it’s designed to catch errors early on and prevent problems that can arise from incorrectly defined columns. The `validate` function does all of this checking, ensuring your column configurations are consistent and reliable.


## Class ClientSizing

ClientSizing helps determine how much to trade based on a set of rules and strategies. It offers different ways to calculate position sizes, like allocating a fixed percentage of your capital, using the Kelly Criterion, or considering Average True Range (ATR). 

You can also set limits to control the minimum and maximum position sizes, as well as a maximum percentage of your capital that can be used for a single trade. 

ClientSizing also allows you to add custom validation steps or log information during the sizing process. It's essential for strategies to figure out the right amount to invest in each trade.

The `calculate` method is the core; it takes inputs and returns the calculated position size.

## Class ClientRisk

ClientRisk manages risk at the portfolio level, ensuring trading signals don't exceed pre-defined limits. It acts as a gatekeeper, preventing signals that would violate maximum position counts or custom validation rules. This component is shared among multiple strategies, enabling a holistic view of risk across different trading approaches.

The `constructor` sets up the initial risk parameters.  It maintains a record of active positions (`_activePositions`) across all strategies, using a combined key to identify each position. `waitForInit` handles the one-time initialization of these active positions, retrieving data from persistent storage unless in backtest mode.  `_updatePositions` is responsible for saving the active positions, but this functionality is bypassed during backtesting.

The core function, `checkSignal`, evaluates whether a signal should be allowed based on configured rules, taking into consideration the current state of active positions.  `checkSignalAndReserve` provides a more robust version of `checkSignal`, guaranteeing atomicity during signal validation and position reservation. This is crucial to prevent multiple strategies from inadvertently exceeding risk limits when running concurrently.  It’s vital to either commit (`addSignal`) or discard (`removeSignal`) the reservation to avoid accumulating stale data in the risk map.

`addSignal` registers a new, opened signal within the system, while `removeSignal` handles the removal of signals that have been closed. These methods are called by the StrategyConnectionService to maintain an accurate record of active positions.

## Class ClientFrame

The `ClientFrame` helps create the timeline for your backtesting simulations. It's responsible for building the sequence of timestamps that your trading strategy will run against.

To avoid unnecessary work, it cleverly caches the generated timeframes, so you don't have to recalculate them repeatedly. 

You can control how frequently these timestamps occur – setting the interval from one minute to one day.  

Plus, you can hook in your own functions to verify the timeframe data and record what’s happening during the generation process.

Essentially, `ClientFrame` provides a way to easily define and manage the chronological order of events in your backtest.

The `getTimeframe` property is your go-to method for actually getting these timestamp arrays. It uses that caching mechanism, ensuring efficient generation of timeframes for each trading symbol.


## Class ClientExchange

This class, `ClientExchange`, handles communication with exchanges to get the data you need for backtesting and live trading. Think of it as a bridge between your trading strategy and the actual market data.

It's designed to be efficient, reusing code where possible to save memory. Here's a breakdown of what it does:

*   **Historical and Future Data:** It can retrieve historical candle data (past price movements) and also look ahead to future data, which is crucial when backtesting strategies.
*   **VWAP Calculation:**  It can calculate the Volume Weighted Average Price (VWAP) based on recent trades.
*   **Formatting:** It intelligently formats quantities and prices according to the specific rules of different exchanges. This is important for accurate order placement.
*   **Flexible Candle Retrieval:** You can fetch candles with very specific date ranges and limits, or let it use the current time as a reference point. The system is very careful to avoid "look-ahead bias," which would skew your backtest results.
*   **Order Book and Aggregated Trades:**  It retrieves the order book to see current bids and asks, and can fetch aggregated trade data.
*   **All about Alignment**:  The system makes sure timestamps align correctly based on the candle interval to ensure accuracy.



Essentially, `ClientExchange` takes care of the messy details of connecting to an exchange and getting data in a format your trading logic can easily understand.

## Class ClientAction

The `ClientAction` component acts as a central manager for your action handlers, those pieces of custom code that extend the framework's functionality. Think of it as a bridge connecting the core trading logic with your specialized tasks like managing state, logging events, or sending notifications.

It carefully handles the lifecycle of your action handlers, ensuring they're initialized only once and cleaned up properly when no longer needed. This avoids unexpected behavior and resource leaks.

The `signal` methods are key – they're how events from both live trading and backtesting are passed to your handlers, allowing you to react to different situations. Separate `signalLive` and `signalBacktest` functions make it easy to tailor actions to specific environments. Other methods like `breakevenAvailable`, `partialProfitAvailable`, and `pingActive` handle specific trading events that you can customize. The `signalSync` method provides a controlled gateway for order execution, designed for critical operations.

## Class CacheUtils

CacheUtils provides a way to easily cache the results of your functions, especially useful in trading strategies where you repeatedly calculate the same things. It acts as a central manager for these caches, making sure they're invalidated and reused efficiently.

It offers two main features: caching regular functions and caching asynchronous functions that rely on file storage. The file-based caching is particularly handy for persisting expensive calculations to disk and retrieving them later.

Think of it as a helper to avoid redundant computations. Each function you want to cache gets its own private cache, ensuring that changes in one strategy don’t affect another.

You can explicitly remove a function's cache with `dispose` or completely clear all caches with `clear` if things like your working directory change. `resetCounter` is a special cleanup function that ensures file-based caches start fresh if your project's base directory changes. Using the `fn` and `file` functions will automatically cache functions for you.

## Class BrokerBase

This `BrokerBase` class acts as a foundation for connecting your trading strategies to real-world exchanges. Think of it as a customizable middleman that handles the communication between your strategy and the trading platform. It provides a set of pre-built methods for common actions like placing orders, managing stop-loss levels, and tracking positions, with default logging already in place.

You can extend this class to create adapters for specific exchanges. This means you’ll implement the methods to handle the exchange-specific logic for things like sending order requests and interpreting the exchange’s responses.

The broker has a lifecycle involving initialization (`waitForInit`), and then a sequence of event-driven methods that are called as your strategy executes.  These methods cover different scenarios: opening a position (`onSignalOpenCommit`), closing a position (`onSignalCloseCommit`), taking partial profits (`onPartialProfitCommit`), cutting losses (`onPartialLossCommit`), and adjusting stop-loss and take-profit levels (`onTrailingStopCommit`, `onTrailingTakeCommit`, `onBreakevenCommit`). It also handles adding new entries for a dollar-cost averaging strategy (`onAverageBuyCommit`). Remember that these events happen only when your strategy is running live, not during backtesting.

## Class BrokerAdapter

The `BrokerAdapter` acts as a middleman between your trading strategy and the actual broker. It's like a safety net that makes sure trading commands are handled correctly and consistently, whether you're testing a strategy or trading live.

Essentially, it intercepts actions like opening or closing positions, setting stop-loss orders, or averaging in, before they affect your trading data. This provides a chance to validate those actions and prevent unwanted changes.

During backtesting, these actions are skipped so the broker isn't actually used.  When you're trading live, the `BrokerAdapter` passes those actions on to your broker.

Here's a breakdown of its key features:

*   **Registration is Key:** You need to tell the `BrokerAdapter` which broker to use by registering it.
*   **Controlled Actions:**  It manages specific actions like opening signals, setting partial profits or losses, trailing stops, and average buys. These actions are intercepted and validated before they impact your trading data.
*   **Live vs. Test:** It gracefully handles both live and backtesting modes.
*   **Automatic Signal Handling:** It automatically routes signal-open and signal-close events.
*   **Managing Connections:** You can activate and deactivate the adapter's connection to your broker using `enable` and `disable`.
*   **Refreshing the Connection:** There's a `clear` function to reset the broker and ensure you're using the most up-to-date connection information.

## Class BreakevenUtils

This class offers tools to analyze and report on breakeven events, helping you understand how your trading strategies perform in relation to breakeven points. It’s designed to work with data gathered by the `BreakevenMarkdownService`.

You can use this class to get statistical summaries of your breakeven events, like the total number of times breakeven was triggered. 

It can also generate detailed markdown reports, creating tables that show information like the trading symbol, strategy used, entry price, breakeven price, and timestamp for each event. These reports include a summary of the statistics at the bottom.

Finally, the class provides a simple way to export these markdown reports directly to files, organizing them by symbol and strategy name for easy reference. The system keeps track of up to 250 breakeven events per symbol and strategy combination.

## Class BreakevenReportService

The BreakevenReportService is designed to keep track of when your trading signals reach their breakeven point – that's the moment they've recovered any initial losses.

It works by listening for these "breakeven" signals and carefully recording all the details, like which signal achieved breakeven and when.

This information is then saved persistently in a database, making it available for later analysis and review of your trading performance. 

To use it, you'll subscribe to the breakeven signals; this setup prevents accidental double-logging. When you're done, you unsubscribe to stop receiving those signals. 

It uses a logger to help with debugging, and it relies on a `tickBreakeven` component to handle the event processing and data storage.

## Class BreakevenMarkdownService

This service helps you automatically create and save reports detailing when your trading strategies hit breakeven points. It listens for breakeven events triggered within your trading framework and organizes them. For each symbol and strategy you're tracking, it builds a markdown table summarizing these events, along with overall statistics like the total number of breakeven occurrences.

You can subscribe to receive these breakeven events, and the service will keep track of them. When you're ready, you can request a summary report or save a complete report directly to a file on your system, neatly organized by symbol, strategy, exchange, frame and backtest. The service also provides a way to clear out all the accumulated data if needed, either for everything or specific combinations. It uses a storage system that keeps data for each symbol-strategy-exchange-frame-backtest pairing completely separate.

## Class BreakevenGlobalService

This service, BreakevenGlobalService, acts as a central hub for managing breakeven tracking within the system. It's designed to be easily integrated into strategies and provides a standardized way to monitor and control breakeven operations. Think of it as a middleman, ensuring that all breakeven-related actions go through a single point and are properly logged for tracking purposes.

It relies on other services – like a logger and connection service – that are provided by the system’s dependency injection container. It also validates strategy and risk configurations to make sure everything is set up correctly.

The `check` function is responsible for determining if a breakeven trigger should occur and then passes that request on. Similarly, the `clear` function handles resetting the breakeven state when a signal closes, delegating the actual work to another service. Essentially, it keeps things organized and simplifies how strategies interact with breakeven functionality.

## Class BreakevenConnectionService

The BreakevenConnectionService manages tracking breakeven points for trading signals. It ensures there's only one tracking instance for each signal, which helps to keep things efficient. 

This service creates and maintains these tracking instances, reusing them as needed to avoid unnecessary work. It also keeps a record of these instances, so they can be easily cleared when a signal is no longer active.

Think of it as a central hub that handles creating, managing, and cleaning up the components responsible for monitoring breakeven points. It works closely with other parts of the system, particularly the ClientStrategy, to make sure breakeven calculations are accurate and up-to-date. 

It uses a technique called memoization to store and reuse these instances, speeding up the process. The service also keeps track of important events and updates related to breakeven points. When a signal is closed, it cleans up its resources to free up memory.

## Class BacktestUtils

This class provides helpful tools and shortcuts for running backtests within the trading framework. It's designed to simplify the process of testing strategies and analyzing their performance.

You can use it to run full backtests, execute them in the background without immediate results (good for logging or callbacks), and get information about the current state of a strategy's position like pending signals, total closed percentage, and effective entry price.

It offers functions to get details on a running strategy, such as pending signals, drawdown metrics, and even simulate actions like canceling signals or adding DCA entries.  The `run` method initiates a backtest, while `background` lets you run one without waiting for the results. It also has convenient methods to peek at critical information like pending signals, breakeven levels, and position costs, all within a specific context (symbol, strategy, exchange, and timeframe).  It's designed to be easily accessible and reused.

## Class BacktestReportService

The BacktestReportService helps you keep a detailed record of your trading strategy's activity during backtesting. It acts like a meticulous observer, capturing every significant event – from when a signal is idle, to when it's opened, active, and finally closed.

It works by listening to the backtest process and saving these events, along with all the relevant details, into a database. This allows you to later analyze what happened and debug any issues.

You subscribe to the service to start receiving these events, and it ensures you won't accidentally subscribe multiple times.  When you're done, you can unsubscribe to stop the recording.

The service uses a logger to provide helpful debugging information, and it relies on a `tick` object to process and log the different event types.

## Class BacktestMarkdownService

The BacktestMarkdownService helps you automatically create and save detailed reports about your trading backtests. It works by listening to the incoming market data (ticks) and keeping track of when trades are closed.

It organizes this information for each strategy you're testing, storing it separately for each symbol, exchange, timeframe, and backtest run. This ensures data doesn’t get mixed up between different tests.

You can then request a summary of the data, which is presented in an easy-to-read markdown table. The service also handles saving these reports directly to your hard drive, making it simple to review your results later.

You can clear the accumulated data if you want to start fresh, or selectively clear data for a specific combination of symbol, strategy, exchange, timeframe and backtest.

To use it, you'll subscribe to receive the tick events, and when you're finished, unsubscribe to stop receiving those events.

## Class BacktestLogicPublicService

This service helps you run backtests of your trading strategies, taking care of a lot of the setup behind the scenes. It simplifies the process by automatically managing the context needed for your strategies, like the strategy name, exchange, and frame.

Think of it as a conductor, coordinating different components like logging, time management, and data retrieval.

You can start a backtest using the `run` method, providing the symbol you want to test. This method produces a stream of results, which will give you insights into how your strategy would have performed. It handles passing the right information to your strategy’s functions so you don't need to pass it explicitly.


## Class BacktestLogicPrivateService

The BacktestLogicPrivateService orchestrates the entire backtesting process, designed to be memory-efficient and flexible. It works by first retrieving the timeframes from the frame service, then sequentially processing each timeframe. 

When a trading signal appears (like a buy or sell indication), it triggers the fetching of candle data and then executes the backtesting logic. 

The process pauses at timeframes where a signal is active, and only resumes when that signal is closed. The results are streamed as you go, one at a time, rather than building up a large list. You can also stop the backtest early if needed.

The service relies on several other core services, including those for handling strategy logic, exchange data, timeframes, method context, and actions. The `run` method is the primary way to initiate a backtest for a specific trading symbol.


## Class BacktestCommandService

This service acts as a central hub for running backtests within the system. It's designed to be easily used and integrated, providing a straightforward way to kick off a backtesting process. 

Think of it as a facilitator—it gathers and manages the various components needed for a backtest, like validating the strategy and exchange configurations.

It offers a single `run` method, which is the primary way you'll interact with it. You give it a symbol to backtest and some contextual information (like the strategy and exchange names you're using), and it returns a stream of results detailing how the strategy performed—whether orders were opened, closed, or cancelled.

## Class ActionValidationService

This service helps you keep track of your action handlers—those pieces of code that respond to specific actions—and makes sure they're available when needed. Think of it as a central place to register and verify your action handlers.

You can add new action handlers using the `addAction` method, providing a name and a schema describing the handler.  Before you try to use an action handler, it’s a good idea to use the `validate` method to confirm it’s properly registered.  The service also remembers previous validation results to speed things up. Finally, `list` lets you see a full inventory of all the action handlers you’ve registered.

The service also internally uses a `loggerService` to log events and a `_actionMap` to store and manage those action handlers.

## Class ActionSchemaService

The ActionSchemaService helps you organize and manage the blueprints for your trading actions. It acts like a central registry, keeping track of all your action schemas and making sure they are structured correctly.

It uses a system to safely store these schemas, ensuring type safety and preventing errors. The service also checks that the methods used within your action handlers are valid and adhere to defined rules.

You can add new schemas using the `register` function, where it checks for errors like duplicate names.  The `validateShallow` function makes sure your schemas have all the necessary parts before they are officially registered.

Need to tweak an existing schema?  The `override` function lets you make changes to specific parts without having to completely re-register it. Finally, `get` allows you to retrieve a schema by name when you need its information.

## Class ActionProxy

The ActionProxy acts like a safety net when you're using custom logic within a trading strategy. It essentially wraps your code (the parts you write to handle signals, profits, losses, and other events) in a protective layer that catches any errors that might occur.

If your code crashes, it won't bring down the entire trading system; instead, the error will be logged and reported, and the system will keep running. This is incredibly useful because it prevents unexpected issues from derailing your backtests or live trading.

Think of it like this: each of your custom functions – like the ones that decide when to take profit or loss – will be carefully monitored. If something goes wrong, the error is caught and handled gracefully.

You don't create ActionProxy objects directly; instead, they're created automatically when a trading strategy is set up, ensuring everything runs smoothly and errors don’t cause critical failures. The `fromInstance` method is used to create these protective wrappers around your custom code.



There are specific methods for handling different types of events like signals, breakeven points, profit/loss levels, scheduled pings, and risk rejections.  One special method, `signalSync`, doesn't use this error-handling protection and is meant to be handled with the utmost care. Finally, `dispose` makes sure resources are cleaned up safely when the strategy finishes.

## Class ActionCoreService

The `ActionCoreService` acts as a central hub for managing actions within your trading strategies. It's responsible for coordinating how actions are handled, ensuring they're correctly invoked and validated.

Think of it as a conductor leading an orchestra of actions – it retrieves the list of actions from the strategy's definition, checks that everything is set up correctly, and then orchestrates their execution.

Here's a breakdown of what it does:

*   **Initialization:** When a strategy starts, the service initializes each action, allowing them to load any necessary persistent data.
*   **Event Routing:**  It distributes various events (like market ticks, breakeven confirmations, or ping signals) to the appropriate actions based on the strategy's configuration. Different event types – backtest, live, or scheduled pings – are routed to actions in a specific sequence.
*   **Validation:** Before anything happens, it validates the strategy's setup, including the strategy name, exchange, frame, risks, and actions defined in the strategy schema. This happens only once per strategy-exchange-frame combination to avoid unnecessary checks.
*   **Cleanup:**  When a strategy finishes, the service cleans up any resources held by the actions.
*   **Synchronization:** `signalSync` offers a way to ensure actions agree on position changes, but it doesn’t handle errors that might arise from individual actions.
*   **Data Clearing:** The `clear` function allows for clearing action data, either for a specific action or all actions across all strategies.



The service relies on other components like validation services and a schema service to perform its duties.

## Class ActionConnectionService

This service acts as a central router for different trading actions within your strategies. It figures out which specific action implementation should handle a given event, like a signal or a ping. It cleverly caches these action instances to avoid repeatedly creating them, which speeds things up, especially when dealing with many strategies or frames.

The `getAction` property is the key to this routing; it uses the action name along with strategy and frame details to pinpoint the correct action.

It provides several methods like `signal`, `signalLive`, `breakevenAvailable`, and so on; these are all ways to send specific events to the appropriate action for processing. Each method takes an event type and ensures it's handled by the correct action within the specified strategy and frame context.

Finally, there’s a `dispose` method to properly clean up action instances when they’re no longer needed, and a `clear` method to flush out the cached action instances.

## Class ActionBase

This class, `ActionBase`, is designed to simplify creating custom actions for your trading strategy. Think of it as a helpful foundation for extending the framework’s capabilities. It automatically handles logging events and provides easy access to strategy context (name, frame, and action).

You can extend this class to add functionality like sending notifications to platforms like Discord or Telegram, managing your strategy's state (using Redux or similar), or performing custom business logic.

Here's a breakdown of how it works:

1.  **Setup:** When created, it receives details about the strategy, frame and action.  You can initialize anything needed during the `init()` method.

2.  **Event Handling:** It provides methods for handling various events like new signals (`signal`, `signalLive`, `signalBacktest`), profit milestones (`partialProfitAvailable`), loss milestones (`partialLossAvailable`), and risk rejections (`riskRejection`).  Each method has a default implementation that logs the event, which you can override.

3.  **Lifecycle:** The `dispose()` method allows you to clean up any resources when the strategy is finished.  This ensures a clean exit.

4. **Specialized Signals:**
    * `signalLive`: for live trading actions.
    * `signalBacktest`: for backtest-specific actions.
    *  Other methods like `breakevenAvailable`, `partialProfitAvailable`, `pingScheduled` etc., cater to specific scenarios within the strategy's lifecycle.

By extending `ActionBase`, you can add custom actions to control and monitor your trading strategy in a structured and maintainable way.

