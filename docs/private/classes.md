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

The WalkerValidationService helps you organize and check your parameter sweep configurations, often used for optimizing trading strategies. It keeps track of all your defined walkers—essentially, sets of parameters you want to test—and makes sure they're correctly set up before you start a backtest.

To help things run faster, the service remembers the results of its checks.

You can add new walkers to the service using `addWalker`, confirm a walker exists and is properly configured with `validate`, and get a list of all registered walkers with `list`. This service works hand-in-hand with other validation services to ensure your strategies, risk profiles, and actions are also valid.

## Class WalkerUtils

WalkerUtils provides a set of tools to simplify running and managing walkers, which are essentially automated trading strategies. It handles the complexities of interacting with the underlying walker system, making it easier to execute and monitor them.

You can use it to run a walker, effectively executing a set of trading strategies for a particular symbol.  There’s also a background execution option, ideal when you just need to trigger actions like logging or callbacks without needing to see the immediate results.

Need to pause a walker?  The `stop` function halts signal generation from the strategies within, ensuring a controlled shutdown.

To get a summary of the walker's performance, you can request its data or a formatted report – this is particularly useful for analysis and review.  You can even save that report directly to a file.

Finally, a handy `list` function shows you all currently running walkers and their states, allowing for easy oversight of your automated trading environment.  Essentially, WalkerUtils acts as a central hub for managing your walkers.

## Class WalkerSchemaService

The WalkerSchemaService helps manage a collection of walker schemas, ensuring they're consistent and type-safe. It uses a registry to store these schemas, allowing you to easily add new ones and find them later by their name.

Before a schema is added, it’s checked to make sure it has all the necessary parts in the right format. 

You can update existing schemas too, providing a way to modify them as needed. The service provides a straightforward way to retrieve a schema once it's registered. 


## Class WalkerReportService

The WalkerReportService helps you keep track of your strategy optimization efforts. It acts as a listener, receiving updates as your optimization process runs, and carefully records these results in a SQLite database. 

This allows you to monitor your strategy's performance over time, identify which parameter settings are working best, and compare different approaches. 

The service uses a logger to provide helpful debugging information and makes sure you aren't accidentally sending too many subscription requests.

You'll use the `subscribe` method to start receiving updates, and `unsubscribe` to stop. The `tick` property is responsible for handling those incoming updates and storing them in the database.


## Class WalkerMarkdownService

The WalkerMarkdownService is responsible for creating and storing reports detailing the performance of your trading strategies as they run within a "walker" (a simulation environment). It listens for updates from the walker, carefully recording the results of each strategy it's testing. These results are then organized into easy-to-read markdown tables, allowing for straightforward comparisons between different strategies.

To manage the data efficiently, it uses a special memoization technique, ensuring each walker has its own dedicated storage space for its results.  You can subscribe to the walker’s updates to receive progress events, and just as easily unsubscribe when you no longer need them.

The service provides methods to retrieve specific data points, generate the complete report, and save that report to your disk, neatly organized in a logs folder. Finally, it offers a way to clear out all the accumulated data, either for a single walker or for all of them.

## Class WalkerLogicPublicService

This service helps manage and run your trading strategies, known as "walkers." It's a public interface built on top of a private service, ensuring your strategies have access to essential information like the strategy's name, the exchange being used, the timeframe, and the walker's identity. 

Think of it as a coordinator that automatically passes along this information as your strategies run.

The `run` method is key – it's how you initiate a backtest for a specific trading symbol, automatically including all the necessary contextual data.  It returns an asynchronous generator, allowing you to process the results as they become available. Essentially, it handles the behind-the-scenes setup so your strategies can focus on their trading logic.


## Class WalkerLogicPrivateService

The WalkerLogicPrivateService helps you compare different trading strategies, acting like a conductor for the process. It runs each strategy one at a time and gives you updates as they finish, allowing you to monitor progress.  

It keeps track of the best performance seen so far during the tests, so you can see which strategy is leading. Finally, it provides a complete report, ranking all the strategies you tested against each other. 

Internally, it uses the BacktestLogicPublicService to actually execute the backtests. You'll also find it utilizes services for markdown generation and defining the structure of the walker itself.

## Class WalkerCommandService

The WalkerCommandService acts as a central point for interacting with walker functionality within the backtest-kit. It simplifies how different parts of the system communicate and provides a way to inject dependencies.

Essentially, it's a layer on top of the `WalkerLogicPublicService`, making it easier to use and manage.

This service relies on several internal services for things like logging, managing walker configurations, validating strategies and exchanges, and ensuring the overall setup is correct.

The `validate` method is used to confirm that a walker and its related settings are configured properly. This validation is done more than once to ensure accuracy and catch any potential issues.

Finally, the `run` method is what actually executes the comparison process for a given symbol (like a stock ticker), passing along information about the walker, exchange, and frame being used.

## Class TimeMetaService

The TimeMetaService is designed to help you reliably access the current candle timestamp, even when you’re not directly inside the core trading loop. Think of it as a central place to get the latest time information for a specific trading setup – a combination of a symbol, strategy, exchange, and timeframe.

It keeps track of timestamps for each of these combinations, updating them automatically as your strategy runs. If you need to know the current time outside of a regular tick, this service can provide it.

If a timestamp isn’t immediately available, it'll wait a short time to see if one arrives. To manage memory and prevent outdated data, you can clear these tracked timestamps when a strategy starts or ends. This ensures you're always working with the most up-to-date information.

The service is managed centrally and automatically updated, so you don’t have to worry about manually tracking timestamps yourself. You can clear all tracked timestamps or clear them individually for specific trading setups.

## Class SystemUtils

SystemUtils helps keep your backtest sessions separate and clean. It prevents one backtest from accidentally messing with another's data.

Think of it as creating a temporary "bubble" around each backtest.

The `createSnapshot` function is like taking a picture of how everything is connected. It clears out the current subscriptions, allowing a backtest to run without influencing other tests. Later, you can restore the connections to exactly how they were before, ensuring a fresh start for the next backtest.

## Class SyncUtils

SyncUtils helps you understand what happened during your trading signal lifecycle, providing insights into signal openings and closures. It gathers data from signal events, like when a trade is started or closed.

You can request statistics, like the total number of signals opened and closed, to get a high-level view of your trading activity.

It also creates detailed reports in Markdown format, displaying all signal events in a table with key information. This report includes details like signal ID, trade direction, prices, profit/loss, and timestamps.

Finally, SyncUtils can automatically save these reports as files, naming them based on the symbol, strategy, exchange, and whether it was a backtest or live trade, making it easy to keep track of your trading history.

## Class SyncReportService

The SyncReportService is designed to keep a detailed record of when signals are created and closed, specifically for auditing purposes. It carefully tracks signal lifecycle events like when a signal is opened (when a limit order is filled) and when it's closed (when a position is exited).

It listens for these events and saves them, including important information such as the signal details when opened, and profit/loss and reason for closure when closed. This information is written to a report database for later review.

To ensure that this process doesn't accidentally run multiple times, it uses a mechanism to prevent redundant subscriptions. You can subscribe to these events and receive updates, and it provides a clear way to unsubscribe and stop receiving those updates.

## Class SyncMarkdownService

This service helps create reports about signal synchronization events, like when orders are opened and closed. It's designed to track and summarize this information in a human-readable format.

It listens for signal events and organizes them based on the symbol, strategy, exchange, frame, and whether it's a backtest or live run. You can think of it as a way to keep a detailed log of what's happening with your trading signals.

To start tracking, you'll use `subscribe` which sets up the system to listen for those signal events. Once you are done, `unsubscribe` stops the tracking and clears all the collected data.

Each time a signal event occurs, the `tick` method processes it, adding details like timestamps and reasons for closing orders, and storing it internally.

You can request data using `getData`, which gives you statistics like total events, opens, and closes for a specific setup. The `getReport` method builds a nicely formatted markdown report, which is like a summary of the signal lifecycle.  Finally, `dump` saves that report to a file.

If you want to completely wipe the slate clean and start over, the `clear` method allows you to erase all accumulated data, or just data for specific combinations.

## Class StrategyValidationService

This service helps you keep track of your trading strategies and make sure they're set up correctly. It acts like a central hub for managing your strategies, ensuring each one exists and that any linked risk profiles or actions are also valid. To speed things up, it remembers the results of its checks so it doesn't have to repeat them unnecessarily.

You can use it to register new strategies, retrieve a list of all registered strategies, and perform validation checks. It relies on other services for risk and action validation, and it offers a way to log information about its processes. Essentially, it's your go-to place for strategy management and ensuring everything is in working order.


## Class StrategyUtils

StrategyUtils helps you analyze and report on how your trading strategies are performing. It’s like a central hub for gathering and presenting information about strategy events, such as when a trade is canceled, partially closed for profit, or adjusted with a trailing stop.

You can use it to get statistical summaries of your strategy's actions – how often it’s taken specific actions like closing trades. 

It also creates nicely formatted markdown reports, which are essentially tables of your strategy's events, including details like price, percentages, and timestamps. You can customize which details appear in those reports.

Finally, it can automatically save these reports to files, creating a clear record of your strategy's history, making it easier to review and optimize its performance. The reports are structured with a filename that includes the symbol, strategy name, exchange, frame and a timestamp.

## Class StrategySchemaService

The StrategySchemaService helps keep track of different trading strategy blueprints, ensuring they're all structured correctly. 

It uses a special system to store these blueprints in a way that catches errors early.

You can add new strategy blueprints using the `addStrategy()` function, and retrieve them later by their name using the `get()` function. 

Before a blueprint is officially added, the `validateShallow()` function makes sure it has all the essential pieces in place.

If you need to make changes to an existing blueprint, the `override()` function allows you to update just the parts you need to change.

The service also has a logger that provides useful information about what's happening behind the scenes.


## Class StrategyReportService

This service provides a way to create a detailed audit trail of your trading strategy's actions, saving each event as a separate JSON file. Think of it as a digital paper trail for your strategy.

To start logging events, you need to "subscribe" to the service. Once subscribed, specific actions like canceling a scheduled order, closing a pending order, taking partial profits or losses, adjusting trailing stops and take profits, or setting a breakeven point will automatically be recorded. Each of these events is saved immediately to disk, making it ideal for reviewing and debugging.

The `unsubscribe` function allows you to stop this logging process, and it's safe to call it even if you haven't subscribed yet.

Here's a quick rundown of the available event types:

*   **cancelScheduled:** Records when a scheduled order is canceled.
*   **closePending:** Records when a pending order is filled and executed.
*   **partialProfit:** Records when a portion of the position is closed for a profit.
*   **partialLoss:** Records when a portion of the position is closed at a loss.
*   **trailingStop:** Records when the trailing stop-loss is adjusted.
*   **trailingTake:** Records when the trailing take-profit is adjusted.
*   **breakeven:** Records when the stop-loss is moved to the entry price.
*   **activateScheduled:** Records when a scheduled signal activates early.
*   **averageBuy:** Records when a new averaging buy order is placed.



The service relies on a logger to manage the writing of these events and includes references to different context services, used for providing more detail in the logs.

## Class StrategyMarkdownService

This service helps you track and report on your trading strategy's activity during backtesting or live trading. It's designed to collect information about events like signals being canceled, positions being closed, partial profits or losses being taken, and trailing stops being adjusted.

Instead of writing each event to a file immediately, it temporarily stores them in memory for more efficient processing. This is useful for generating detailed reports and exporting them in a readable Markdown format.

Here’s how it works:

1. **Start Collecting:** Use `subscribe()` to tell the service to start tracking events.
2. **Automatic Collection:** The service automatically records events as your strategy executes actions.
3. **Accessing Data:** When you need a report, use `getData()` to get statistics and events, or `getReport()` to generate a formatted Markdown report. `dump()` lets you save that report to a file.
4. **Cleanup:**  `unsubscribe()` stops the data collection and clears all stored information.

You can customize the reports by choosing which columns to display and where to save the file. The `clear()` method provides flexibility in clearing data, allowing you to remove specific sets of data or everything at once. The `getStorage` property helps manage the creation of storage instances.

## Class StrategyCoreService

The `StrategyCoreService` acts as a central hub for managing strategies and their execution context, essentially providing a layer of coordination within the backtest framework. It leverages other services like `StrategyConnectionService` and `ExecutionContextService` to handle tasks such as validation, signal retrieval, and position-related calculations.

Here's a breakdown of its key functionalities:

*   **Validation:** It performs checks to ensure strategy configurations and associated risks are valid, caching results for efficiency.
*   **Signal Management:** Provides methods to retrieve pending signals, scheduled signals, and calculate related metrics like total profit/loss, position levels, and entry counts.
*   **Position Analysis:** Offers functions to determine the status of positions, including profit/loss percentages, cost basis, and DCA information.
*   **Lifecycle Control:** Enables actions like pausing, stopping, and closing strategies or signals.
*   **Backtesting & Ticking:**  Handles the execution of backtests and individual "ticks" (time steps) for strategies, ensuring proper context is provided.
*   **Monitoring and Metrics**: Provides various methods to retrieve metrics related to signal status, risk and drawdown.

Overall, `StrategyCoreService` provides a structured and reusable way to interact with and monitor strategies within the backtest environment, managing the context and delegating specific tasks to other services.

## Class StrategyConnectionService

This service is responsible for managing and routing strategy operations. It acts as a central point for interacting with different trading strategies, ensuring that calls to strategy methods are directed to the correct implementation based on the symbol and strategy name. It optimizes performance by caching strategy instances.

Here's a breakdown of its key functionalities:

*   **Strategy Routing:** It intelligently directs requests to specific strategies based on pairings of symbols and strategy names.
*   **Performance Optimization:** It avoids unnecessary strategy initialization by caching instances and reusing them when possible.
*   **Synchronization:** Ensures strategies are initialized before any operations are performed.
*   **Comprehensive Operations:** Supports both real-time trading (`tick`) and historical backtesting (`backtest`) scenarios.
*   **Status Tracking:** Provides methods to check the status of strategies and signals.
*   **Signal Management:** Offers tools to control signals, including scheduling, activation, cancellation, partial closes (profit/loss), and take/stop adjustments.
*   **Data Retrieval:** Allows retrieval of a variety of information about positions, such as costs, P&L, levels, and timelines.

The service utilizes several other services like `loggerService`, `exchangeConnectionService`, and `timeMetaService` to execute its operations. It provides methods for initiating various actions like adjusting stop-losses and take-profits, and managing signals.

## Class StorageLiveAdapter

The `StorageLiveAdapter` acts as a flexible middleman for managing how your trading signals are stored. It allows you to easily switch between different storage methods—like persistent storage to disk, in-memory storage, or even a dummy adapter that does nothing—without changing your core trading logic.

Think of it as a pluggable system: you can swap out the storage backend as needed. The default storage method is persistent, meaning your signals are saved to disk. There are also options for temporary in-memory storage and a "dummy" mode useful for testing.

The adapter handles events like signals being opened, closed, scheduled, or cancelled, passing those actions on to the currently selected storage. It also provides ways to find signals by ID and list all of them.

`useStorageAdapter` is a key feature; it allows you to specify which storage method you want to use. You can quickly switch to dummy, memory, or persistent storage with simple commands like `useDummy()`, `useMemory()`, or `usePersist()`. Importantly, the `clear()` function is essential if your working directory changes between strategy runs, ensuring you get a fresh storage instance. This keeps things running smoothly as your environment evolves.

## Class StorageBacktestAdapter

This component manages how your backtest data is stored, offering flexibility to choose different storage methods. It acts as a central point for interacting with different storage solutions, like keeping data in memory, persisting it to disk, or using a dummy storage for testing. You can easily switch between these storage methods using convenient functions like `useMemory`, `usePersist`, and `useDummy`.

It handles events like signal openings, closings, scheduling, and cancellations, passing these on to the currently selected storage adapter. You can retrieve signals by ID or list all stored signals through this component as well. 

There's also a mechanism to memoize (cache) the storage utility instance to improve performance, but it can be cleared if you need to rebuild it, particularly when the working directory changes. This allows you to easily test and manage the persistence of your backtest signals. The `useStorageAdapter` function lets you register your own custom storage implementations if you need more specialized behavior.

## Class StorageAdapter

The StorageAdapter is responsible for managing and keeping track of both historical trading signals (backtest data) and signals generated in real-time. It automatically updates its storage as new signals appear.

You can turn on the storage functionality, which involves subscribing to these incoming signals, and you only need to do this once thanks to a built-in mechanism to prevent duplicate subscriptions.  Conversely, you can disable the storage to unsubscribe and stop receiving updates.

If you need to retrieve specific signals, you can search by their unique ID.  You also have the ability to easily list all the signals that were used in backtesting or those currently being tracked live.

## Class StateLiveAdapter

The StateLiveAdapter helps manage the trading state in a flexible way, allowing you to easily switch between different storage methods. It’s designed to remember important information about trades, even if your application restarts.

You can choose to store this information in a file on your computer (the default), keep it only in the current memory (for testing or quick changes), or even discard it entirely (for a dummy adapter). 

The adapter is particularly useful for implementing sophisticated trading rules, like the example using an LLM to evaluate trades – it can track how long a trade has been open and its peak profit, then automatically close it if certain conditions aren’t met. 

The `disposeSignal` method lets you clear out old data when a trading signal is finished. 

You can also use helper functions like `useLocal`, `usePersist`, and `useDummy` to quickly switch between different storage options and `useStateAdapter` to bring in your own custom storage. The `clear` function is useful for ensuring fresh instances when your working directory changes.

## Class StateBacktestAdapter

The `StateBacktestAdapter` provides a flexible way to manage and store state information during backtesting, allowing you to choose different storage methods. It's designed to track things like peak performance and how long a trade has been open, which is useful for evaluating trading strategies and rules, such as those informed by LLMs.

By default, it uses an in-memory storage, meaning data is lost when the process ends. You can easily switch to a file-based storage to persist data between runs or use a dummy adapter for testing purposes.  The adapter also allows you to plug in your own custom storage implementations.

The `disposeSignal` method helps clean up old data when signals are closed, and `clear` ensures you're using fresh instances when your working directory changes. You can quickly switch between different storage types using `useLocal`, `usePersist`, `useDummy` or `useStateAdapter`.

## Class StateAdapter

The StateAdapter is the central piece for managing how your backtest and live trading data is stored. It automatically handles cleaning up old data when signals are stopped, making sure you don't end up with unnecessary clutter.

You can enable the adapter to start storing data, and it will only subscribe to the signal once to prevent problems. It’s also safe to disable it multiple times, ensuring it doesn’t cause any issues when you’re done.

To get the current state for a signal, use `getState`, and to update the state, use `setState`. These methods smartly direct the operation to either the backtest storage or the live storage, depending on your needs.

## Class SizingValidationService

This service helps you keep track of and verify your position sizing strategies, ensuring they're properly set up before you start trading. It acts as a central place to register your sizing approaches and confirms they exist before any operations are performed. To make things efficient, it remembers previous validation results, so checks aren't repeated unnecessarily.

You can register new sizing strategies using `addSizing`, and use `validate` to double-check a sizing strategy is available.  If you need a quick overview, `list` will display all the sizing strategies you’ve registered. The service also manages its internal workings and relies on a logger for diagnostic information.

## Class SizingSchemaService

The SizingSchemaService helps you keep track of and manage your sizing schemas in a structured and type-safe way. It uses a specialized registry to store these schemas, ensuring they're organized and easy to find.

You add new sizing schemas using the `addSizing()` method, and then retrieve them later by their assigned name.

Before a sizing schema is added, it goes through a quick check to make sure it has all the essential parts and types.

The `register` method adds a new sizing schema to the registry.
The `override` method allows you to update an existing sizing schema with just the changes you want to make.
The `get` method lets you retrieve a specific sizing schema by its name.

## Class SizingGlobalService

The SizingGlobalService helps determine how much to trade, acting as a central hub for position sizing calculations. It uses other services, like sizing validation, to ensure sizing requests are valid. Think of it as the engine that figures out the size of your trades based on your risk preferences and trading strategy. 

It’s used behind the scenes by both the core trading system and accessible through the public API. 

Here's what's inside:

*   It relies on a `loggerService` for logging information.
*   It uses `sizingConnectionService` to handle the connection for sizing operations.
*   `sizingValidationService` is utilized to verify sizing calculations.
*   The `calculate` function is the main method for determining the position size; it takes sizing parameters and context data and returns a calculated size.

## Class SizingConnectionService

The SizingConnectionService acts as a central hub for managing how your trading strategy determines position sizes. It directs sizing requests to the specific sizing implementation you've defined.

This service uses a technique called memoization to keep things efficient; it remembers previously used sizing calculations so it doesn’t have to recompute them every time. 

You tell it which sizing method to use by providing a "sizingName." If your strategy doesn't have any custom sizing rules, you'll use an empty string as the sizingName.

The service handles calculations like determining how much of an asset to buy or sell, taking into account your risk management preferences and chosen sizing approach.  It can support methods like fixed-percentage sizing, Kelly criterion, or sizing based on Average True Range (ATR).


## Class SessionLiveAdapter

This component provides a flexible way to manage live trading sessions, allowing you to easily switch between different storage methods. It acts as a central point for accessing and updating session data during live trading.

You can choose where your session data is stored – either in memory for a quick, temporary setup, on disk for persistence across restarts, or even use a dummy adapter that simply discards any changes. The system remembers your choice for each trading setup (combination of symbol, strategy name, exchange, and frame).

The file-system backed storage is the default, ensuring your progress is saved between restarts. If the working directory changes, you might need to clear the internal cache to ensure new session instances are created correctly. It's designed to be adaptable, letting you plug in your own custom storage solutions as well. Essentially, it's a smart wrapper around different session data implementations.

## Class SessionBacktestAdapter

This component helps manage and store data during backtesting, acting as a bridge between your trading strategies and different ways of saving that data. It offers flexibility by allowing you to easily switch between several storage methods.

By default, it uses an in-memory storage, meaning data is held only while the backtest runs.  You can switch to persistent storage, saving the data to disk, or use a dummy adapter that simply ignores all data writes for testing purposes. 

It also lets you plug in your own custom storage solutions. The `useLocal()`, `usePersist()`, `useDummy()`, and `useSessionAdapter()` methods make changing the storage backend simple.  Data is organized and retrieved using `getData()` and `setData()`, allowing you to access and modify session values for each trading symbol, strategy, exchange, and timeframe.  Finally, `clear()` provides a way to wipe the internal cache if the working directory changes, ensuring a fresh start for each backtest iteration.

## Class SessionAdapter

The `SessionAdapter` is the central piece for handling data during your backtesting and live trading sessions. It acts as a dispatcher, automatically directing requests to either the backtesting storage (`SessionBacktest`) or the live trading storage (`SessionLive`) depending on whether you're in backtest mode.

You can retrieve data for a specific signal using the `getData` method, providing the symbol, context (strategy, exchange, frame), whether it's a backtest, and a timestamp. Similarly, the `setData` method allows you to update the session data for a signal, again routing the operation to the appropriate storage based on the backtest flag. Both methods make sure your data is stored where it should be.


## Class ScheduleUtils

The ScheduleUtils class offers tools to help you understand and monitor how scheduled signals are performing. It's a central point for accessing information and generating reports related to signals that are queued for execution.

Think of it as a helpful assistant for keeping tabs on your scheduled trading activity.

Here’s what it does:

*   It lets you retrieve statistics about scheduled signals for a specific trading strategy and symbol.
*   You can generate detailed markdown reports summarizing the events of scheduled signals.
*   It also allows saving these reports directly to a file on your computer.
*   The utility functions provide quick access to data, tracking things like cancellations and wait times. 

It’s designed to be easy to use – just access it as a single, readily available instance.

## Class ScheduleReportService

This service helps track scheduled signals and their lifecycle, such as when they're created, activated, or cancelled. It’s designed to record events related to signals that aren’t executed immediately and stores these details in a database. 

Think of it as a logging system specifically for signals that are planned for later.

It keeps track of the time it takes between when a signal is scheduled and when it's either executed or cancelled, allowing you to monitor delays.

You can use the `subscribe` function to tell this service to start listening for signal events and will receive a function that you can call to stop listening. The `unsubscribe` function ensures you stop listening if you’ve subscribed.

## Class ScheduleMarkdownService

The ScheduleMarkdownService helps you track and report on scheduled trading signals. It keeps an eye on when signals are scheduled and canceled, organizing the information by strategy. 

It builds detailed reports in a readable markdown format, providing insights like cancellation rates and average wait times. These reports are automatically saved to disk for each strategy.

You can subscribe to receive these signal events, and there’s a way to unsubscribe if needed.  The service accumulates signal events and then allows you to retrieve statistics or generate full reports. 

The `dump` function saves these reports directly to files, while `clear` lets you wipe the collected data, either entirely or for a specific strategy and configuration.  The system uses isolated storage for each combination of symbol, strategy, exchange, frame, and backtest to keep things organized.

## Class RiskValidationService

This service helps keep track of your risk management settings and makes sure they're valid before you use them. Think of it as a central place to register your risk profiles, like different strategies for managing potential losses. It also checks to confirm that a profile exists before any actions are taken, preventing errors.

To improve speed, the service remembers the results of those checks, so it doesn't have to do the same validation multiple times. 

You can add new risk profiles, check if a profile exists, and view a complete list of all the profiles you've registered. This makes sure your risk management setup is consistent and reliable.

## Class RiskUtils

This class provides tools for analyzing and reporting on risk rejection events. Think of it as a way to understand why your trading strategies sometimes get stopped or adjusted due to risk controls.

It gathers information about rejections, such as the symbol involved, the strategy used, the position size, and the reason for the rejection. You can then use this information to generate reports.

You can request summarized statistics to see overall rejection patterns, or generate detailed markdown reports that show a table of individual rejection events. These reports can also be saved to files for later review.

The class automatically organizes and structures this data, making it easier to identify potential issues in your trading strategies and risk management settings. The reports include summaries and key details about each rejection, helping you understand the context and root cause.

## Class RiskSchemaService

This service helps you manage and store risk schemas in a type-safe way. It uses a registry to keep track of these schemas.

You can add new risk profiles using the `addRisk()` method (which is accessible through the `register` property).  If you need to update an existing schema, you can use the `override` method to apply changes.

To get a specific risk profile, simply use the `get` method, providing its name.  Before adding a new schema, the `validateShallow` function checks to ensure it has the basic structure you expect. 

The service also has internal components for logging and managing its registry.

## Class RiskReportService

This service is designed to keep a record of when trading signals are rejected by the risk management system. It essentially acts as a log for potential issues or concerns identified during the trading process.

It listens for these rejection events and carefully records the details, including why the signal was rejected and what the signal was. This information is then stored in a database, making it possible to analyze trends, audit decisions, and generally understand the system’s behavior.

You can set up the service to receive these rejection events, and it makes sure you don’t accidentally subscribe multiple times. When you’re done tracking rejections, there’s a simple way to stop the service from receiving those events.

## Class RiskMarkdownService

The RiskMarkdownService helps you create reports detailing rejected trades due to risk management. It listens for rejection events and organizes them by symbol and strategy. The service automatically generates clear, readable markdown tables summarizing these rejections, along with helpful statistics like the total number of rejections and breakdowns by symbol and strategy.

You can subscribe to receive these rejection events, and the service ensures you won't be bombarded with duplicates.  When you're done receiving updates, you can easily unsubscribe.

The service allows you to retrieve statistics, generate reports, and save them as markdown files, making it simple to analyze and review your risk management decisions.  You can also clear the stored rejection data when it's no longer needed, optionally clearing only data for specific symbols and strategies.

## Class RiskGlobalService

RiskGlobalService is a central component for managing risk within the trading framework. It acts as a gatekeeper, ensuring that trading signals adhere to predefined risk limits before they're executed.

This service relies on other components for its operations, including services for connecting to risk systems and performing validation.

The `validate` function checks risk configurations, and it's designed to be efficient by remembering previous validations.

The core function, `checkSignal`, determines whether a signal is permissible based on risk rules. `checkSignalAndReserve` provides a safe method for validating and reserving resources related to a signal, critical for concurrent operations.

Finally, `addSignal` and `removeSignal` track open and closed trading signals within the risk management system, and `clear` allows for resetting risk data, either for specific configurations or a complete reset.

## Class RiskConnectionService

The RiskConnectionService acts as a central hub for managing risk checks within the trading system. It ensures that risk validation is directed to the correct implementation based on the specific risk configuration.

It efficiently caches these risk implementations to avoid repeated creation, speeding up the validation process. Think of it as a smart router that knows where to send risk-related requests.

Here's a breakdown of what it does:

*   **Signal Validation:** It verifies if a trading signal should be executed, checking things like portfolio drawdown and position limits.
*   **Concurrency Safety:** There's a special function (`checkSignalAndReserve`) that makes sure risk checks are safe even when multiple operations are happening at the same time – preventing issues with signal reservation.
*   **Signal Management:** It handles registering new signals and removing those that have been closed.
*   **Risk Clearing:** You can manually clear the cached risk implementations when necessary.

The service relies on other components like the `RiskSchemaService`, `TimeMetaService`, and `ActionCoreService` to function correctly, so those are injected when the service is created. It uses a system of "risk names" to route requests – if there's no risk configuration, the risk name is simply left blank.

## Class ReportWriterAdapter

This framework component, the ReportWriterAdapter, helps you manage and store your trading data in a structured way. Think of it as a flexible system for capturing events and analytics from your backtesting or live trading strategies.

It uses a pattern that allows you to easily swap out how the data is stored, whether that's to a JSONL file, a database, or something else entirely.  The system remembers which storage method is used for each type of report (like backtest results or live trading logs), so you don’t create multiple copies of the same data.

You can customize the way data is stored by providing a new "factory" to build the storage adapter. The system automatically starts the storage process the first time you write data and keeps track of everything. If you need to switch storage methods, or want to start fresh, you can clear the system's memory of existing storage instances. You also have the option of using a dummy adapter that ignores all write requests, useful for testing. Finally, you can always revert back to the default JSONL storage.

## Class ReportUtils

ReportUtils helps you control which parts of the backtest-kit framework generate detailed logs. Think of it as a way to turn on or off the data collection for things like backtest runs, live trading, or performance analysis.

The `enable` function lets you choose which logging services to activate, allowing you to track specific events in real-time and save them to JSONL files. This is useful for deep dives into how your strategies are performing. Remember to use the cleanup function it provides to stop the logging later – otherwise, you might run into memory issues.

The `disable` function is the opposite; it lets you stop logging for certain services without affecting others. This helps when you want to focus on specific areas or reduce data volume. It doesn’t require a cleanup function because it stops logging immediately.

This utility is often extended by other components, so you can easily customize it for your specific reporting needs.

## Class ReportBase

The `ReportBase` class provides a simple way to log trading events to files in a structured JSONL format. It's designed to efficiently handle lots of data by writing events as individual lines in a file, ensuring that new data is always appended. 

The class automatically creates the necessary directories and handles potential write errors, giving you a reliable logging system. You can easily filter these log files later using metadata like the trading symbol, strategy, exchange, timeframe, signal ID, and walker name.

Initialization of the file and writing stream only happens once, even if you call the initialization multiple times. The writing process itself is protected to avoid timeouts and manage buffering efficiently. You supply the data you want to log and some optional settings, and the class takes care of formatting it and writing it to the file.

## Class ReportAdapter

The ReportAdapter helps manage how trading data and analytics are stored, allowing you to easily switch between different storage methods. Think of it as a flexible system for logging your trading activity.

It remembers which storage method you're using, so you don't have to specify it every time you want to record something. By default, it uses a simple JSONL format for storing data.

You can change the storage method it uses, allowing you to experiment with different ways of saving your data. It also provides a "dummy" mode for testing where no data is actually saved.

If you need to change the location where reports are saved, you can clear the adapter's memory to force it to create new storage instances based on the updated location. 


## Class ReflectUtils

This utility class, `ReflectUtils`, helps you track key performance metrics for your trading positions – things like profit and loss, peak profit, and drawdown – in real-time. It acts as a central hub, simplifying access to this data from your strategies, whether you're live trading or backtesting.  You don’t need to instantiate it directly; it's available as a global, easy-to-use instance.

Here’s a breakdown of what it provides:

*   **Real-time position data:** It gives you access to information such as unrealized P&L (both percentage and cost), peak profit prices and timestamps, and drawdown information.
*   **Comprehensive metrics:**  It calculates and exposes metrics like the time a position has been active or waiting, and the duration of drawdown periods.
*   **Contextual information:** The methods accept context (strategy, exchange, frame) and a `backtest` flag, ensuring they work across different scenarios.
*   **Easy access:** All the calculations account for partial closes, DCA entries, slippage and fees.

Essentially, `ReflectUtils` provides a convenient and validated way to monitor your positions' performance and gain insights into their behavior.  The methods return `null` if there is no active signal to calculate from.

## Class RecentLiveAdapter

This component helps you manage and retrieve recent trading signals, offering flexibility in how those signals are stored. It’s designed to be adaptable, allowing you to switch between different storage methods like persistent storage on disk or storing signals only in memory.

The `RecentLiveAdapter` uses a factory pattern, making it easy to swap out the storage backend without changing the rest of your code.  You can easily choose between the default persistent storage or opt for a memory-only solution.

To get the latest signal, retrieve how long ago a signal was created, or handle active pings, the adapter passes these requests to the currently configured storage adapter.  

The `useRecentAdapter` method lets you specify exactly which storage implementation to use, while `usePersist` and `useMemory` provide convenient shortcuts for switching to those common options. The `clear` method is important for scenarios where the environment changes, ensuring a fresh storage instance is used.

## Class RecentBacktestAdapter

This component helps manage and access recent trading signals, offering flexibility in how those signals are stored. It acts as a bridge, letting you choose between keeping signals in memory or persisting them to disk.

You can easily swap out the storage mechanism by using `usePersist` to store data on disk or `useMemory` for in-memory storage - the default is memory storage. The `clear` function is important if your working directory changes during a test; it ensures a fresh storage instance is used.

The `handleActivePing`, `getLatestSignal`, and `getMinutesSinceLatestSignalCreated` methods provide access to functionality handled by the selected storage backend.  You have control over which storage class is used through `useRecentAdapter`, which lets you specify a different storage implementation entirely. The `getInstance` property handles getting the correct storage instance, ensuring it's only created once and reused.

## Class RecentAdapter

The RecentAdapter manages and stores recent trading signals, whether you’re running a backtest or live trading. It automatically updates its signal storage when new data arrives.

You can easily retrieve the most recent signal for a specific trading pair, strategy, exchange, and timeframe using `getLatestSignal`. This method prioritizes backtest data and then looks at live data. Importantly, it prevents look-ahead bias by only returning signals that occurred before a specified time.

`getMinutesSinceLatestSignalCreated` tells you how long ago the last signal was generated, also respecting the look-ahead bias.

To control the adapter, you can `enable` it to start listening for updates, or `disable` it to stop. The `enable` function is designed to ensure it only subscribes once. Calling `disable` multiple times is safe and will simply have no effect.

## Class PriceMetaService

PriceMetaService helps you track the latest market prices for your trading strategies. It keeps a record of prices for each combination of symbol, strategy, exchange, and timeframe.

Think of it as a central place to get the current price without being tied to the moment a trade is happening.

It automatically updates these price records after each tick from your strategy and has a built-in timeout to ensure you get a price even if it hasn't arrived yet. If you need a price quickly during a trade, it will default to using the exchange's average price.

You can clear these cached prices when you start a new strategy or want to free up memory, and you can clear all of them at once or just the price for a specific symbol. The service is designed to be reset at the beginning of each strategy run to keep things fresh and avoid using old data. It is managed automatically as a singleton by the framework.

## Class PositionSizeUtils

This class offers helpful tools for determining how much of an asset to trade, which is essential for managing risk. It includes several pre-built methods for calculating position size, like fixing a percentage of your account at risk, applying the Kelly Criterion (a more sophisticated approach based on win rates and ratios), and using Average True Range (ATR) to gauge volatility. Each method has built-in checks to ensure the sizing parameters align correctly with the chosen approach, reducing the chance of errors. 

The class doesn't require any setup; you can directly use the available methods.

Here’s a breakdown of the available sizing methods:

*   **fixedPercentage:**  This method determines position size based on a fixed percentage of your total account balance you're willing to risk.
*   **kellyCriterion:**  This more advanced method calculates position size based on win rate and win/loss ratio.
*   **atrBased:** This method uses the Average True Range (ATR) to gauge market volatility and determines position size accordingly.

## Class Position

The `Position` class provides helpful tools for determining take profit (TP) and stop loss (SL) prices when trading. It simplifies the process by automatically adjusting the direction of your trade based on whether it's a long (buy) or short (sell) position.

The `moonbag` method offers a quick way to set a take profit level that’s a fixed percentage above (for long positions) or below (for short positions) the current price. 

The `bracket` method gives you more control, allowing you to specify both a take profit and a stop loss percentage, customizing your risk and reward levels. This method calculates the actual price points for both TP and SL based on your current price and defined percentages.

## Class PersistStrategyUtils

This class helps manage how your trading strategies remember their state between runs, especially when dealing with delayed actions like order confirmations or cancellations. It makes sure that each strategy's data is stored and retrieved reliably.

It automatically creates a storage system for each strategy based on its symbol, strategy name, and exchange, which prevents conflicts and keeps things organized. You can even customize how the data is stored by swapping in different "adapters" – like using a file, JSON, or even a dummy adapter for testing that does nothing.

The `readStrategyData` function gets the saved data when a strategy starts up, while `writeStrategyData` saves any changes. This ensures your strategy picks up where it left off. The `clear` function resets these cached storages.

Finally, if you want to use the default file-based storage, the `useJson` method does that for you, and `useDummy` allows for testing scenarios without any actual data persistence.

## Class PersistStrategyInstance

This class helps you save and load the state of your trading strategy to a file. Think of it as a way to remember where your strategy was when it was stopped, so it can pick up right back where it left off.

It automatically handles saving the strategy data in a safe way, even if your program crashes unexpectedly.

Here's what you need to know:

*   **Initialization:** It needs to be initialized before use.
*   **Storage Key:** It uses a specific, unchanging key ("strategy") to identify the saved strategy data.
*   **Data Handling:** It provides methods to read the saved strategy state and write new states to the file, allowing your strategy to persist its progress.
*   **Context-Specific:** The storage is scoped to a particular context, meaning each strategy instance has its own storage location.
*   **File-Based:** This class works with files to store the strategy data.

## Class PersistStorageUtils

This class provides tools to reliably save and load signal data, especially when running backtests or live trading. It keeps track of different storage options, ensuring that each signal is stored as a separate file identified by its ID.

It handles saving and retrieving all signals for either backtesting or live mode, and it automatically sets up the necessary storage components the first time they’re needed. 

You can customize how the data is stored by providing your own storage "adapter," effectively swapping out the default file-based storage for something else. It’s designed to be resilient, managing potential crashes and ensuring data integrity. If your working directory changes during a strategy run, you'll need to clear the storage to avoid problems. You can easily switch between using a real file-based storage, a JSON-based storage, or a dummy storage for testing purposes.

## Class PersistStorageInstance

This class provides a way to store trading signals persistently using files on your computer. It's designed to be reliable, even if your program unexpectedly stops, because it uses safe file writing techniques. 

Each signal you save is stored in its own JSON file, making it easy to find and manage them. When you need to retrieve all your signals, the system goes through each of these files.

You can control whether this storage is used for backtesting purposes when you create an instance of this class.

The `waitForInit` method ensures the storage is ready before you start using it.  `readStorageData` pulls all saved signals back into your program, while `writeStorageData` handles saving new or updated signals to those individual files.


## Class PersistStateUtils

This class helps manage and save your trading strategy's state persistently. It's designed to ensure that information like indicator calculations or order details isn't lost if your program unexpectedly stops.

Think of it as a helper for storing and retrieving data related to specific signals and buckets, ensuring that the information stays consistent even across restarts. It smartly handles the creation of these storage instances, making sure you don't have to worry about creating them yourself.

You can easily switch between different ways of persisting your data – like using a real file system, a dummy adapter for testing, or even providing your own custom storage solution. The `waitForInit` method helps set things up initially, and functions like `readStateData` and `writeStateData` handle the actual loading and saving. There are also methods to clear the cache or clean up specific signal data when it's no longer needed. You can even replace the default behavior with your own custom state persistence logic.

## Class PersistStateInstance

This class, `PersistStateInstance`, provides a simple way to store and retrieve state data related to a trading signal. Think of it as a convenient tool for saving information like your strategy’s settings or the results of a backtest. It automatically handles writing data to a file, organizing it using a unique identifier for each signal. 

The `signalId` and `bucketName` properties define how this data is organized. The `waitForInit` method ensures the storage is ready before you start saving data.

You can retrieve existing state using `readStateData`, and update it using `writeStateData`.  Don’t worry about cleaning up resources; the system handles that automatically when you're done. Essentially, it makes persisting your backtest data very straightforward.

## Class PersistSignalUtils

This class provides tools to reliably store and retrieve signal data for your trading strategies. It's designed to handle situations where you need to save the state of a signal, like when a strategy restarts or crashes.

The system intelligently manages storage instances for each strategy, symbol, and exchange combination, ensuring that data is kept separate and organized.

You can customize how this storage works by providing your own signal instance constructors, or switch between different storage options like file-based persistence or a dummy mode for testing. 

The `readSignalData` method retrieves existing signal information, while `writeSignalData` saves new or updated data. The entire process is designed to be as safe and reliable as possible. If you ever need to change the storage method, you can easily do so. There's also a `clear` function to wipe the stored data when necessary.


## Class PersistSignalInstance

This class provides a way to save and load signal data to a file. It's designed to be reliable, even if your program crashes unexpectedly.

It stores signal information, linking it to a specific trading strategy and exchange. Think of it as a persistent memory for your trading signals.

The class handles the technical details of writing data safely to disk, ensuring it's done correctly. It uses a file-based system, so your signals are saved even when you restart your application.

You can retrieve the previously saved signal data, or update it with new information, using the `readSignalData` and `writeSignalData` methods. Before you start using it, `waitForInit` makes sure everything is properly set up.

## Class PersistSessionUtils

This class helps manage how trading sessions are saved and loaded, ensuring things like your settings and data are preserved. It's designed to be reliable, even if your application crashes unexpectedly.

It keeps track of session data in files, organizing them neatly within a directory structure based on your trading strategy, exchange, and frame.

The system smartly caches these saved sessions, avoiding redundant loading and saving. You can even customize how sessions are stored—using the built-in file system or providing your own storage solution.

Key functions let you read existing session data, write new data, and even clear the cached sessions when needed, for example, when switching between different working directories. There's also a "dummy" mode for testing where no actual saving happens, and a way to swap the storage method entirely. It has methods to initialize the session storage and clean up resources when sessions are no longer needed.

## Class PersistSessionInstance

This class helps manage and save the state of your trading sessions, especially useful when you want to resume where you left off. It focuses on storing information related to a specific trading strategy, exchange, and timeframe.

Think of it as a way to automatically save your progress during a backtest or live trading session. 

It uses a unique identifier for each symbol being traded, combining the strategy name, exchange, timeframe, and a flag to distinguish between backtest and live data. This prevents different symbols from overwriting each other's saved state.

The class handles writing session data to a file and reading it back, making sure the information is stored reliably. Importantly, it doesn’t manage cache cleanup itself – that's taken care of by another component, `PersistSessionUtils`. You don't need to do anything extra to clean up resources.


## Class PersistScheduleUtils

This class helps manage how scheduled signals are saved and loaded, especially for trading strategies. It ensures that each strategy's signals are stored reliably and in a way that can be customized.

The system intelligently creates storage locations for signals, creating a new one only when needed for a specific trading symbol, strategy, and exchange.

You can plug in different ways of storing these signals, like using files or a custom database, or even simulate persistence for testing.

To get the stored signal information for a specific setup, use `readScheduleData`. To update or remove those signals, use `writeScheduleData`.

If you need to switch how signals are persisted – for instance, to use a different storage method or switch to a test mode – you can use `usePersistScheduleAdapter`, `useJson`, or `useDummy`.

Sometimes you might need to clear the stored data, like when the program's working directory changes. The `clear` method handles that.

## Class PersistScheduleInstance

This class helps you reliably store and retrieve data related to scheduled trading signals. Think of it as a way to save information about when a strategy should execute on a particular exchange for a specific asset. It uses a file to keep this data safe, even if your program crashes unexpectedly. 

It organizes data by combining the symbol (like AAPL), strategy name, and exchange name to uniquely identify each signal. 

The class includes methods to:

*   Initialize the storage area.
*   Read existing scheduled signal data for a specific asset and time.
*   Save or clear scheduled signal data.

Essentially, it provides a dependable way to ensure your trading signals are saved and can be reloaded later.

## Class PersistRiskUtils

This class helps manage how trading positions are saved and loaded, especially for risk management. It remembers which storage method to use for each risk profile, preventing unnecessary setup.

It ensures that position data is read and written reliably, even if there are unexpected interruptions.

Here's what you can do with it:

*   **Change how data is stored:** You can easily switch between different storage methods, like files or custom systems, or even use a dummy version for testing.
*   **Refresh storage:** There's a way to clear the storage settings, which is useful when the program's working directory changes.
*   **Lazy Loading:** The storage is only created when it's actually needed, which can improve performance.
*   **Atomic operations:** Read and write operations are handled carefully to avoid data corruption.



The `PersistRiskInstanceCtor` property lets you specify the type of storage to use, while `getRiskStorage` handles the actual creation of storage instances. `readPositionData` retrieves saved positions, and `writePositionData` saves them.

## Class PersistRiskInstance

This component helps manage and save trading positions persistently, using a file on your system. It's designed to be reliable, ensuring data isn't lost even if your program crashes. 

It essentially acts as a safe keeper for your position data, storing it in a JSON file. 

The `PersistRiskInstance` uses a specific filename ("positions") to organize your data and offers a way to make sure the storage is ready before you start writing to it. 

You'll provide a risk name and exchange name when you create it, which helps identify the data it's handling. 

The `readPositionData` function retrieves the saved position data, while `writePositionData` adds new or updated position information.

## Class PersistRecentUtils

This class helps manage how recent trading signals are saved and retrieved, ensuring they're handled consistently across different strategies and environments. It's a key component for both backtesting and live trading scenarios, working closely with other utility functions for persistence.

The class uses a clever system to create and manage storage instances based on the symbol, strategy name, exchange, and timeframe you're working with, effectively avoiding redundant setups. You can even customize how these signals are persisted by providing your own storage solutions.

It's designed to be reliable, handling situations where the program might crash and ensuring your data integrity.

Here’s a breakdown of what you can do:

*   **Customization:** You can easily swap in different methods for storing signals, like using a file or a completely dummy implementation for testing.
*   **Cache Clearing:** The ability to clear the cache is important if your working directory changes, ensuring the system uses the correct storage location.
*   **Simple Switching:** Convenient methods allow you to switch back to the default file-based storage or to a dummy no-op storage for testing purposes.
*   **Automatic Initialization:** The storage for signals is automatically created the first time it's needed.

## Class PersistRecentInstance

This class, `PersistRecentInstance`, helps you save and load the most recent data for a trading strategy, ensuring you don't lose important information. It's designed to work with files, automatically handling the process of writing data safely. 

Think of it as a way to keep a record of the last signal your strategy generated, and it organizes these records based on the trading symbol, strategy name, exchange, and the timeframe you're using. The class tracks whether the data is from a backtest or live trading scenario.

Internally, it uses a storage mechanism to manage these saved signals. 

You can use `waitForInit` to make sure the storage is ready before you start working with it. To retrieve the latest saved data, use `readRecentData`, and to save new data, use `writeRecentData`. The data is identified by the trading symbol, so each symbol has its own saved recent data.

## Class PersistPartialUtils

This class, PersistPartialUtils, helps manage how trading strategies remember their progress, specifically profit and loss information, over time. It's designed to ensure this data is stored reliably, even if things go wrong.

It keeps track of these "partial" data points for each trading symbol, strategy, and exchange, creating dedicated storage for each. This storage is created on demand, only when needed, and can be customized to use different methods for persistence, like files or even a dummy instance for testing.

You can easily switch between different storage methods, like using a default file-based system or a testing-only "dummy" system that does nothing with the data. If you need to change how the data is stored, you can also register your own custom storage system.

It's important to clear the stored data if your working directory changes, which is useful when running multiple strategies. This utility simplifies the process of saving and retrieving this partial data, contributing to the overall stability of your backtesting and live trading environments.

## Class PersistPartialInstance

This class, `PersistPartialInstance`, helps you save and retrieve pieces of data related to your trading strategies, like progress or intermediate results. It's designed to be reliable even if your program crashes unexpectedly.

It uses a file to store this data, organizing it based on the trading symbol, strategy name, and exchange. Each piece of data is identified by a unique signal ID.

The constructor takes the trading symbol, strategy name, and exchange name to set up the storage scope. It automatically manages the underlying file storage, making sure writes are handled safely and efficiently.

You can use `waitForInit` to ensure the storage is ready before working with it, and `readPartialData` to get previously saved data for a specific signal.  Similarly, `writePartialData` lets you save the current state of a signal's data.


## Class PersistNotificationUtils

This class provides tools for safely storing and retrieving notification data, ensuring it's handled reliably even if errors occur. It acts as a central place to manage how notifications are saved, using a specialized storage system for each testing mode (like backtesting versus live trading).

You can customize how notifications are stored by providing your own way of creating storage instances.  The class intelligently caches these storage options to avoid unnecessary creation.

Retrieving and saving notification data are handled through simple functions, which automatically initialize the storage system the first time they’re used.

If you need to change the storage location (for example, if you're switching directories), you can clear the cache to force a refresh. There’s also a "dummy" mode available for testing purposes, where notifications aren't actually saved anywhere.



The `PersistNotificationInstanceCtor` property lets you provide your own class for managing notification persistence. 

`getNotificationStorage` provides a way to get the specific storage instance for a particular mode (backtest or live).

`readNotificationData` loads existing notification data.

`writeNotificationData` saves new notification data.

`usePersistNotificationAdapter` lets you register a custom storage constructor.

`clear` resets the cache of storage instances.

`useJson` reverts to the default file-based storage.

`useDummy` enables a mode where nothing is actually persisted.

## Class PersistNotificationInstance

This class provides a way to save and load notification data to files, ensuring your trading system remembers important information even if it crashes. It's designed to work well within a backtesting environment. 

Each notification is stored in its own JSON file, making it easy to manage and understand individual events. The system keeps track of all these files and loads them when needed. 

The process is made safer by using atomic writes, so you don't have to worry about corrupted data.

Here’s a breakdown of how it works:

*   The constructor lets you specify if you’re running a backtest.
*   `waitForInit` prepares the file storage to be ready for use.
*   `readNotificationData` gathers all the saved notifications, one by one.
*   `writeNotificationData` takes a collection of notifications and saves each one to its own file.

## Class PersistMemoryUtils

This utility class, `PersistMemoryUtils`, helps manage how trading data is saved and retrieved persistently, making sure your backtesting system can recover even if it crashes. It handles storing data in files within a specific directory structure, like `./dump/memory/<signalId>/<bucketName>/<memoryId>.json`.

Think of it as a smart manager for your memory instances, creating a unique one for each trading signal and bucket to keep things organized. 

Here's a breakdown of what it offers:

*   **Customizable Storage:** You can plug in different ways to store the data, using custom constructors or switching back to a default file-based option, or even using a dummy version for testing purposes.
*   **Lazy Loading:** It only loads the necessary data when it’s needed, which helps keep things efficient.
*   **Safe Operations:** Reads, writes, and deletions are handled carefully to prevent data corruption.
*   **Cleanup:** It allows you to clear caches and release resources when signals are no longer needed, keeping things tidy and preventing unnecessary storage.
*   **Index Rebuilding:** A way to iterate through and rebuild data indexes if needed.

`waitForInit` lets you control when initialization happens, especially helpful for the very first time the system runs. `listMemoryData` helps rebuild indexes, ensuring efficient data retrieval. The `clear` function is critical when your working directory changes between strategy runs. `dispose` cleans up after a signal's removal.

## Class PersistMemoryInstance

This class provides a way to store and retrieve data persistently, primarily using files. Think of it as a place to save information that needs to be remembered even after your application restarts.

It's designed to work with a specific identifier (`signalId`) and a named container (`bucketName`) to organize the data.

The class handles writing data to disk safely and allows you to mark data as deleted (instead of permanently removing it), which is helpful for some situations.

Here's a breakdown of what you can do:

*   **Initialization:**  You can ensure the storage is ready when it needs to be.
*   **Reading:** It lets you fetch individual data entries by their unique ID.
*   **Existence Check:** You can quickly see if a particular data entry exists before trying to read it.
*   **Writing:** It allows you to save new data entries or update existing ones.
*   **Deletion:**  You can 'soft delete' entries, meaning they're marked as deleted but remain on disk.
*   **Listing:**  It provides a way to view all available data entries, excluding those that have been marked for deletion.
*   **Cleanup:** It doesn't handle its own cleanup. That's managed by a separate utility.

Essentially, it simplifies the process of saving and managing data across sessions.

## Class PersistMeasureUtils

This class helps manage how your trading data, specifically responses from external APIs, are saved and retrieved persistently. It's designed to ensure data isn't lost and that accessing it is efficient.

It uses a system where each piece of data is stored in a specific "bucket" identified by a timestamp and symbol, and creates instances to manage these buckets. You can even customize how these buckets are managed with different adapters.

The class handles reading, writing, and even "soft-deleting" (marking as removed, rather than completely deleting) data.  It automatically creates the necessary infrastructure to handle these buckets the first time they are used. 

To help with testing or experimentation, you can easily switch to a dummy adapter where no data is actually stored. A built-in adapter uses standard files, and you can swap between them.  The class also offers a way to clear its internal memory of these buckets, which is useful if your program's working directory changes.

## Class PersistMeasureInstance

This class provides a way to persistently store and retrieve measure data, like trading results or performance metrics, using files. 

It acts as a layer on top of a basic file storage system to ensure data is written safely and consistently. 

You can think of it as a manager for a specific collection of data within a bucket. 

The system supports a way to effectively "delete" data by marking it as removed rather than physically deleting the file, allowing you to potentially recover it later. 

When you need to see the data, it automatically filters out those "soft-deleted" entries.

The constructor requires you to specify a bucket name to organize your data. 

Methods allow you to read a specific data entry by its key, write new data, or remove data (soft-delete). 

Finally, a method is available to list the keys of all the currently active (not removed) data entries.

## Class PersistLogUtils

This class provides tools for managing how your backtest kit stores and retrieves log data. It handles the underlying storage, ensuring a consistent way to save log entries even if things go wrong.

The system uses a single, cached instance of a log storage mechanism which can be customized, allowing you to switch between different storage adapters like file-based storage or even a dummy adapter for testing. 

You can think of it as a central point for controlling how log data is saved, read, and managed, keeping your backtesting process reliable and easy to adapt.

The `readLogData` method retrieves all saved log entries, and `writeLogData` adds new entries (without duplicates).

The `usePersistLogAdapter` method lets you plug in your own way of storing logs, while `clear` resets the log storage, useful when running multiple backtests in the same session. Finally, `useJson` and `useDummy` offer quick switches to default or non-functional log storage for different scenarios.


## Class PersistLogInstance

This component handles storing your trading backtest logs to disk. Think of it as a persistent memory for your backtest runs.

It creates a separate file for each log entry, using a unique ID to identify them.  This allows it to retrieve all your log data by simply listing the files it has.

Importantly, it's designed for append-only logging; it won't overwrite existing data, ensuring the integrity of your historical logs. It also includes crash-safe writing to protect against data loss.

The `waitForInit` method gets the storage ready to go.  `readLogData` retrieves all the logged information, and `writeLogData` adds new log entries to the persistent storage. The internal `_storage` property manages the actual file storage.

## Class PersistIntervalUtils

This framework component helps manage signals that need to happen at specific intervals, ensuring they only fire once for each time period. It essentially keeps track of when these signals have already been processed.

It stores this information as simple files within a directory structure, allowing you to easily verify that signals haven't been repeated.

You can customize how this tracking is done, choosing between using actual files, a JSON-based system, or even a "dummy" mode that doesn't write anything to disk (useful for testing).

The framework handles reading, writing, and deleting these markers automatically, so you don’t have to worry about the file management details. If you need to change the storage mechanism, there are methods to swap out the adapter for creating the interval markers.

The `clear` method helps to reset the stored interval data if your working directory changes during the backtesting process.

## Class PersistIntervalInstance

This class provides a way to store and retrieve data related to intervals, using files to persist the information. Think of it as a system for keeping track of when certain actions should happen, and ensuring those actions can be rescheduled if needed. It essentially manages a collection of "markers" tied to specific time intervals.

The data is organized within a designated "bucket," which is like a folder for your interval information.  When you need to retrieve a marker, it checks if the marker exists and hasn’t been marked for deletion.

If you delete a marker, it doesn't actually erase the file; instead, it adds a flag indicating it’s been removed. This allows for a graceful recovery if something goes wrong, as the interval can be reactivated.

The `listIntervalData` method gives you a way to see all the active markers within the bucket, providing a view of all the scheduled intervals. It's designed to prevent deleted intervals from showing up in your list.

## Class PersistCandleUtils

This class helps manage a cache of historical candle data, storing each candle as a separate file to allow for persistence. It's designed to efficiently retrieve and store this data, ensuring that if a sufficient number of cached files exist, the data is returned directly. 

If the data is incomplete, it automatically updates and refreshes the cache. The `getCandlesStorage` property is important because it manages how these individual candle caches are created.

You can customize how the cache is implemented by using `usePersistCandleAdapter` to provide your own way of handling persistence. `useJson` and `useDummy` let you easily switch between the default file-based persistence and a dummy implementation for testing or development purposes. The `clear` method is helpful for situations where the working directory changes during testing. Finally, the `readCandlesData` method gets the data and `writeCandlesData` saves it.

## Class PersistCandleInstance

This class helps you save and retrieve historical candle data persistently, like to a file. It’s designed to work with the backtest-kit framework.

Think of it as a way to remember what the market looked like at specific times, even after your program stops running.

Each candle's data is stored in its own file, making it easy to access individual points in time. If a candle's data is missing, it’s treated as a request to fetch it again.

When saving candles, it ensures that only complete candles (those with a `closeTime` in the past) are stored, and it won't overwrite existing data. This helps maintain a clean and reliable record.

The `waitForInit` method makes sure the underlying storage is ready before you start reading or writing data.  The `readCandlesData` method efficiently pulls a range of candles, returning `null` if any timestamp is unavailable. The `writeCandlesData` method appends new, complete candles to the storage.


## Class PersistBreakevenUtils

This class helps manage and save the breakeven state of your trading strategies, making sure that data persists even when your program restarts. It's designed to keep track of specific breakeven points for each trading signal within a strategy on a particular symbol and exchange.

Think of it as a central place to store and retrieve breakeven information, organizing it within files structured by symbol, strategy, and signal ID.

The class uses a clever system to ensure you're not creating unnecessary storage instances – it only creates them when needed and remembers them for future use. You can even customize how this storage works by swapping out the default file-based storage with alternatives like a dummy storage for testing. It handles saving and loading of this data securely, ensuring consistency.


## Class PersistBreakevenInstance

This class helps manage and store breakeven data for trading strategies, ensuring the information is kept safe and reliable. It essentially acts as a persistent storage layer, specifically designed for breakeven calculations.

The class takes the trading symbol, strategy name, and exchange name during setup to identify where the data belongs. It uses a file-based storage system, but it's designed to handle unexpected interruptions (like crashes) gracefully by writing data in a safe manner.

You can initialize the storage, retrieve existing breakeven data using a unique signal identifier and a timestamp, and also save new breakeven data in a similar manner, again using the signal ID.  This class builds upon a more fundamental storage component, making sure all writes happen reliably and as a single, complete operation. It uses the signal ID as a unique identifier for each data entry it manages.


## Class PersistBase

`PersistBase` provides a foundation for reliably saving and retrieving data to files. It's designed to ensure that your data remains consistent, even if unexpected issues arise during the writing process. 

This class handles the complexities of managing files, including creating directories, checking for and correcting damaged files, and safely deleting old data. It also allows you to efficiently loop through all your stored data using an asynchronous generator.

You specify a name for your data (the `entityName`) and the main directory where these files will be stored. It calculates the correct file path for each piece of data and handles the actual saving and loading process. The `waitForInit` method sets up the storage location initially and verifies the integrity of existing data. You can then use `readValue` to get data, `hasValue` to check if data exists, and `writeValue` to save data—all with a focus on keeping things safe and reliable. The `keys` function lets you iterate over all the stored IDs.

## Class PerformanceReportService

This service helps you keep track of how long different parts of your trading strategy take to run. It acts like a detective, gathering information about timing events during strategy execution.

The service listens for these timing events and carefully records them, including how long they took and some extra information. These records are then stored so you can analyze them later – maybe to find bottlenecks or figure out how to make things run faster.

You can tell it to start listening for these timing events, and it will automatically begin recording.  To stop listening, there's a way to quickly cancel that subscription.  It also prevents accidental multiple subscriptions, ensuring accuracy. 

It uses a logger for any debugging output and has a special system to ensure only one subscription exists at a time.


## Class PerformanceMarkdownService

This service helps you keep track of how your trading strategies are performing. It listens for performance updates, organizes them by strategy, and then calculates important statistics like averages, minimums, maximums, and percentiles. 

You can think of it as a data collector and reporter. It automatically creates easy-to-read reports in markdown format, including insights into potential bottlenecks. These reports are saved to your logs directory. 

The service provides ways to subscribe to performance events, unsubscribe when you're done, and retrieve the accumulated performance data. You can also clear this data when needed. It uses a clever system to ensure each trading combination (symbol, strategy, exchange, frame, and backtest) has its own dedicated storage space.

## Class Performance

The Performance class helps you understand how well your trading strategies are performing. It allows you to gather detailed statistics about a specific strategy and trading symbol, breaking down performance by different types of operations. 

You can request a comprehensive report summarizing this data, which is presented in a readable markdown format and highlights potential bottlenecks. 

The class also offers the ability to easily save these performance reports to your computer, automatically creating the necessary directories to keep them organized. You can specify the file path, or let the class handle it with a sensible default location.




The `getData` method retrieves the raw performance statistics.
The `getReport` method generates a formatted report.
The `dump` method saves the report to a file.

## Class PartialUtils

The PartialUtils class helps you analyze and understand the partial profits and losses your trading strategies experience. It’s like a tool to review the little bits of profit and loss that happen along the way, not just the final result.

You can use it to get summarized statistical data, like the total number of profit and loss events.

It can also create detailed reports in markdown format, showing each individual profit and loss event with information like the symbol traded, the strategy used, the price, and the time it occurred. These reports give you a clear picture of what's happening during your trades.

Finally, this class can save those reports directly to files, so you can keep a record of your strategy's performance over time. The file names are organized and easy to understand, for example, "BTCUSDT_my-strategy.md".

## Class PartialReportService

The PartialReportService helps you keep track of how your trades are performing by recording every time a portion of a position is closed, whether it's a profit or a loss. It essentially listens for signals indicating partial exits, then stores details like the price and level at which those exits occurred.

This service has a logger to help with debugging. It also processes profit and loss events, and provides a way to subscribe to these events—but it makes sure you don’t accidentally subscribe multiple times.  You can also unsubscribe when you no longer need to record these partial exits. The recorded data is then used to build a more complete picture of your trading activity.


## Class PartialMarkdownService

The PartialMarkdownService helps you keep track of and report on your trading performance, specifically focusing on profits and losses. It listens for these events as they happen and organizes them by the symbol traded and the strategy used. It then automatically creates readable markdown reports summarizing these events, including key statistics like total profit and loss.

You can configure it to save these reports directly to your hard drive, making it easy to review your trading history. The service keeps data separate for each combination of symbol, strategy, exchange, timeframe, and backtest, so your reports stay organized.

To start using it, you need to subscribe it to the signals that indicate when profits and losses occur. You can also request specific data or reports, clear accumulated data, or adjust where the reports are saved. The `clear` function provides flexibility in removing event data, allowing you to clear everything or just specific combinations.

## Class PartialGlobalService

This service acts as a central hub for managing and tracking partial profits and losses within the trading system. It's designed to be injected into the core trading strategy, making it a key dependency.

Think of it as a gatekeeper – it logs every operation related to partial profits and losses before passing them on to a specialized connection service. It also handles validations to ensure the trading strategy and associated configurations are correct.

The service provides several functions for managing partials:

*   `profit`: Records and broadcasts when a profit level is reached.
*   `loss`: Tracks and reports new loss levels.
*   `clear`: Resets the partial state when a signal is closed out.

It's built to streamline operations and offer centralized monitoring of partial trading activity.

## Class PartialConnectionService

The PartialConnectionService manages the tracking of partial profits and losses for trading signals. It ensures that each signal has its own dedicated record for these calculations, avoiding confusion and ensuring accuracy.

Think of it as a central hub that creates and maintains these signal-specific records. It intelligently reuses these records to avoid unnecessary work, caching them for quick access.

When a signal makes a profit or experiences a loss, this service is responsible for calculating the amount and notifying other parts of the system.  It also handles cleaning up these records when a signal is finished, making sure nothing is left behind. 

The service works closely with other components like the ClientStrategy and ActionCoreService to ensure everything operates seamlessly. It’s designed to keep track of signal-specific data, allowing for detailed and accurate profit/loss reporting.

## Class OrderTransientError

This class, `OrderTransientError`, is a way to explicitly mark failures that are temporary and can be retried. Think of it as a signal to your code that "this isn't a permanent problem, try again later." It's not special to the backtest-kit itself; any regular error thrown would be treated the same way, but this provides clarity for developers.

When an error is marked as transient, the framework handles it differently depending on whether it's related to opening or closing an order, or performing a check. For opening orders, the system will retry the request, using the same signal as before. Closing orders are also retried, keeping the position open temporarily. For checks, the system will simply tolerate the failure and keep monitoring the order.

Be aware that if these transient errors continue to occur, the system will eventually give up and signal a more serious, fatal error. Unlike other error types, a transient error exhaustion means a critical problem has occurred and the system needs to be stopped. The counters associated with these errors are persistent, so even if the system crashes, the retry attempts are remembered. Finally, this error type is primarily for clarity in code and isn't actually used by the framework to make decisions—it's purely for developer understanding.

## Class OrderRejectedError

OrderRejectedError represents a situation where an order submission has been definitively rejected by the exchange—it's not a temporary problem, and retrying won't help. It's specifically thrown within the order execution pathways, like when interacting with a broker or handling order confirmations.

When this error is thrown, the framework immediately stops the order process: for new orders, the signal is dropped entirely, preventing any further retries.  For closing orders, the system forces a position closure based on the original reason (take profit, stop loss, etc.), bypassing the usual retry process. While this is an error, it’s considered a normal, albeit undesirable, business outcome, not a critical system failure.

You should only use this error to indicate a confirmed, permanent reason for rejection, like insufficient funds or delisted symbols. Network issues or temporary limits should trigger standard errors or OrderTransientError instead, so that retry mechanisms can function. Throwing this error outside of the designated order execution channels will result in it being treated as a transient error, and retried. 

The error's message is for informational purposes only, and its routing is based on its specific brand, not its content. Remember this error is mainly relevant in live trading environments, as backtesting often bypasses these checks. To check if an error is an OrderRejectedError, use the static `isOrderRejectedError` method; avoid using `instanceof`.

## Class OrderDeletedError

This error signals that the exchange has definitively confirmed an order is no longer present – essentially, it's gone. This isn’t due to temporary issues like network problems; it means the order was likely canceled by the user or automatically liquidated.

You should only throw this error from order checks, specifically those triggered by the broker adapter or action schema. The framework immediately treats this as a confirmed deletion and acts accordingly: open positions are closed, scheduled orders are canceled, and the process skips retry attempts. 

It's crucial to remember that this error isn't for every "missing" order. A filled order or a position closed due to a triggered stop-loss should be handled differently.  This error is only for when the exchange explicitly says the order isn’t there.

Throwing this error in the wrong place, like within a gate function, will degrade it to a temporary issue – a deliberate design choice to prevent premature closures.  It's also identified by a unique runtime brand, making it robust across different module versions. Remember, this error won't occur during backtests since it relies on a live exchange connection. Finally, it has a constructor to create instances and a static method to reliably identify instances even when dealing with different module copies.

## Class NotificationLiveAdapter

This component helps you send notifications about your trading activity, like signals, profits, losses, and errors. It's designed to be flexible, so you can choose how those notifications are handled – whether it’s stored in memory, saved to a file, or just discarded.

You can easily switch between different notification methods: a default in-memory storage, a persistent storage, or even a dummy adapter for testing purposes where notifications are ignored. Each event like a signal, a profit, or an error is passed to the currently active notification method.

The `handleSignal`, `handlePartialProfit`, `handlePartialLoss`, `handleBreakeven`, `handleStrategyCommit`, `handleSync`, `handleCheck`, `handleRisk`, `handlePause`, `handleError`, `handleCriticalError`, and `handleValidationError` functions all pass data to the current notification method.

You can retrieve all stored notifications with `getData` or clear them completely with `dispose`.  The `useNotificationAdapter` function lets you specify exactly which class should handle notifications.  `useDummy`, `useMemory`, and `usePersist` functions provide shortcuts to select pre-defined notification adapters.  Finally, `clear` resets the notification system, important when the program's working directory changes during backtesting.

## Class NotificationHelperService

This service helps manage and send out notifications related to trading signals, particularly useful during backtesting. It checks that your trading strategy, the exchange you’re using, and the trading environment are all set up correctly – and it does this efficiently by remembering previous checks so it doesn't repeat the same validation unnecessarily.

The `validate` function is the heart of this validation process, storing the results to speed things up.

The `commitSignalNotify` function is how the framework sends out those signal notifications. It combines validation with retrieving the pending signal and then broadcasting it to anyone who's listening. This allows for signal information to be shared and recorded throughout the testing or live trading process. 

It relies on several other services for things like logging, schema management, risk assessment, and core strategy functions.

## Class NotificationBacktestAdapter

This component helps manage notifications within your backtesting framework, offering a flexible way to store and handle signal events, partial profits/losses, and other important strategy updates. It acts as a central hub, allowing you to easily switch between different notification implementations – such as storing notifications in memory, persisting them to disk, or even discarding them entirely (using a dummy adapter).

You can choose how notifications are handled by switching between different adapters: a default in-memory adapter, a persistent adapter for saving to disk, or a dummy adapter for testing purposes. Methods like `useMemory`, `usePersist`, and `useDummy` make this switching process simple. The `handle...` methods provide a standard way to process different types of events, from signal generation to error reporting, making sure all updates are delivered through the currently configured notification adapter.  The `clear` function ensures fresh adapter instances are created when necessary, like when the working directory changes, maintaining reliable notification processing.

## Class NotificationAdapter

This component handles notifications, keeping track of both the simulated backtesting data and any live trading activity. It's designed to automatically update notifications as signals are generated. 

To prevent unwanted duplicates, it uses a "singleshot" feature ensuring each subscription happens only once.

You can control when notifications are active using the `enable` property, which allows you to subscribe to specific notification types, and the `disable` function to stop them. It's perfectly safe to call `disable` more than once. 

The `getData` function lets you retrieve all stored notifications, specifying whether you want the backtest data or the live data. Finally, `dispose` clears all notifications from storage, ensuring a clean slate.

## Class MemoryLiveAdapter

This `MemoryLiveAdapter` helps you manage data during live trading, acting as a flexible storage layer that you can easily swap out. It allows you to choose where your data is stored – in memory for quick access, persistently on your file system, or even discarded with a dummy adapter for testing.

You can switch between different storage methods like using a local, in-memory adapter, persisting data to files, or using a dummy adapter for testing. The adapter keeps track of your data using memoization to optimize performance, and it provides methods for writing, searching, listing, removing, and reading memory entries.

To clean up data for specific signals, you can use `disposeSignal` to remove associated memoized instances. You have control over the storage mechanism through methods like `useLocal`, `usePersist`, `useDummy`, and `useMemoryAdapter` allowing you to plug in custom implementations. When your working directory changes, remember to call `clear` to refresh the adapter’s base path.

## Class MemoryBacktestAdapter

This component provides a flexible way to manage memory storage during backtesting, allowing you to choose different storage methods based on your needs. It's like having different types of notebooks – one that keeps everything in RAM for speed (the default), one that saves to files for persistence, one that just throws everything away for testing, or even the ability to plug in your own custom storage solution.

You can easily switch between these storage options with commands like `useLocal`, `usePersist`, and `useDummy`. The `disposeSignal` method is important for cleaning up memory when a trading signal is finished or cancelled.

The API offers functions to write data (`writeMemory`), search for data using full-text search (`searchMemory`), list all data (`listMemory`), delete data (`removeMemory`), and read individual entries (`readMemory`). You can also clear the entire cache with `clear`, which is helpful when the application's working directory changes. Think of it as a central place to store and retrieve information during your backtesting experiments.

## Class MemoryAdapter

The MemoryAdapter is the central component for managing how your backtests and live trading sessions store and retrieve information. Think of it as a smart traffic controller, directing data operations to the appropriate system depending on whether you're in backtest mode or live trading.

It automatically handles cleanup to prevent memory from becoming cluttered with old data when signals are finished. To start using it, you enable the memory storage, and it subscribes to signal events to do so. Similarly, you can disable it safely, even multiple times, to stop this monitoring.

You can write data to memory, search for specific information using full-text search, list all stored entries, remove unwanted entries, or read a specific entry. Importantly, the `backtest` flag in your requests ensures that the data is handled by the correct backend system – either your backtest environment or your live trading setup.

## Class MaxDrawdownUtils

This class helps you analyze and understand the maximum drawdown experienced by your trading strategies. Think of it as a tool to examine how much your strategy lost at its worst points.

It gathers data from events that track maximum drawdowns.

You can use it to get detailed statistics about a specific trading strategy and symbol combination. This includes information like the maximum loss, when it occurred, and how it compares to other events.

You can also generate reports in markdown format, either to view on screen or save to a file. These reports provide a clear overview of the drawdown history, allowing for easier analysis and comparison between strategies. 

Finally, it's designed to work with both backtesting scenarios and live trading contexts, letting you assess performance across different environments.

## Class MaxDrawdownReportService

The `MaxDrawdownReportService` helps you keep track of your trading performance by recording significant drops in equity – known as maximum drawdowns. It monitors events related to these drawdowns and saves detailed information about them.

This service connects to a system that flags drawdown events and then writes that data, along with relevant details like timestamps, symbols, strategy names, and prices, into a database for analysis.

To start recording drawdown events, you'll need to subscribe to the service.  It’s designed to avoid accidentally subscribing multiple times. When you’re finished, you can unsubscribe to stop the recording process. If you never subscribed, unsubscribing does nothing.

## Class MaxDrawdownMarkdownService

This service is designed to automatically create and save reports about maximum drawdown, a key risk metric for trading strategies. It keeps track of drawdown data for each trading symbol, strategy, exchange, and timeframe.

To start tracking, you need to subscribe to a data stream (`maxDrawdownSubject`). When you’re done, you can unsubscribe to stop the tracking and clear the accumulated data.

You can retrieve the collected drawdown data using `getData` or generate a formatted markdown report with `getReport`. The report can also be saved directly to a file using `dump`. 

For cleaning up stored data, `clear` allows you to remove all accumulated drawdown information or selectively clear data for a specific combination of symbol, strategy, exchange, and timeframe.

## Class MarkdownWriterAdapter

This component helps you manage how your trading reports are saved. It provides a flexible way to choose where and how your data is stored, like in separate files, a single log file, or not at all. The system remembers the storage setup you choose, so it doesn’t have to be reconfigured.

You can easily switch between different storage methods using functions like `useMd`, `useJsonl`, or `useDummy`.  `useMd` creates individual markdown files for each report, `useJsonl` combines everything into a single JSONL file, and `useDummy` essentially turns off the markdown output entirely.

You can also customize the underlying storage mechanism by setting a new constructor with `useMarkdownAdapter`. The component automatically handles setting up the storage when you write data for the first time and it keeps a record of the storage setups to optimize performance. If you need to reset the storage, `clear()` allows you to do so.

## Class MarkdownUtils

MarkdownUtils helps you manage the creation of markdown reports for various parts of your trading system, like backtests, live trading, and performance analysis.

You can choose exactly which components should generate markdown reports, activating them individually. When you activate a report service, it starts collecting data and preparing the report – don't forget to unsubscribe to stop the process and avoid memory issues.

Alternatively, you can disable report generation for specific areas without affecting others. This lets you control the resource usage of your reports.

Finally, there’s a way to wipe the existing data for a markdown report without completely stopping it. This resets the report's data while keeping the reporting service running.

## Class MarkdownFolderBase

This adapter lets you create reports as individual markdown files within a folder structure. It's designed for easy readability and manual inspection of your backtest results.

Each report gets its own `.md` file, named and placed based on the `options.path` and `options.file` you provide.

The adapter handles creating the necessary directories automatically. 

You don’t need to worry about managing streams of data; it writes directly to files.

This is the default adapter, perfect for scenarios where you want well-organized, human-readable report directories. 

It's a simple adapter with no special initialization needed.


## Class MarkdownFileBase

This framework component, `MarkdownFileBase`, helps you create and manage markdown reports in a structured way, specifically designed for backtesting and trading systems. It writes your markdown reports as JSON lines (JSONL) to separate files, making them easy to process and analyze with standard JSON tools.

The system ensures reliable writing by handling potential issues like full buffers and timeouts, and it creates necessary directories automatically. It also centralizes error handling for consistent reporting. You can organize your reports by specifying the type of report (`IMarkdownTarget`), and each report line includes helpful metadata like the trading symbol, strategy name, exchange, frame, and signal ID, making filtering and searching much simpler.

Initializing the adapter involves creating the directory and stream once, and you can safely call the initialization multiple times. The `dump` method is the key to adding your markdown content to the JSONL file, automatically including metadata for easy searching and filtering.


## Class MarkdownAdapter

The MarkdownAdapter helps manage how your markdown data is stored, offering flexibility to switch between different storage methods. It’s designed to be adaptable, letting you choose how your markdown files are created and saved. 

You can easily change the adapter to use separate files for each markdown type, or to store everything in a single JSONL file. 

It also includes a 'dummy' adapter which is useful for testing because it simply ignores any writes. 

The adapter automatically handles creating instances and remembers your choices, ensuring consistent storage behavior. Shortcut functions `useMd()` and `useJsonl()` allow quick changes to the storage method.

## Class LookupUtils

The `LookupUtils` framework acts like a central registry, keeping track of all ongoing backtesting and live trading activities. When a backtest, live trading session, or a strategy's iteration begins, it's registered here. Similarly, when an activity finishes, it's removed from the registry.

This registry is useful for managing resources and optimizing performance, particularly when dealing with parallel processing. It determines whether to hand off control to another task, preventing unnecessary delays when only one task is running.

The `addActivity` function registers a new activity, and it can safely be called multiple times for the same activity, effectively updating the existing entry. Conversely, `removeActivity` cleans up after an activity is done, which is especially important in case of errors to avoid leaving behind lingering entries. Finally, `listActivity` gives you a current snapshot of all the activities that are currently running. Access this functionality through the `Lookup` singleton, which doesn't require any initialization.

## Class LoggerService

The LoggerService helps you keep your logging organized and informative across your trading strategies and backtests. It provides a centralized way to record events and errors, automatically adding helpful details like which strategy, exchange, or frame is involved, as well as information about the symbol, time, and whether it’s a backtest. If you don't configure a specific logger, it defaults to a do-nothing logger.

You can customize the logging behavior by providing your own logger implementation through the `setLogger` method. The service then uses this provided logger internally.

It also contains `log`, `debug`, `info`, and `warn` methods, which are shortcuts for different logging levels, all automatically enhanced with contextual information.




The `methodContextService` and `executionContextService` are internal components used for injecting context into the logs, so you typically won't interact with them directly.

## Class LogAdapter

The `LogAdapter` provides a flexible way to manage how your trading backtests record information. Think of it as a central hub for your logs, allowing you to easily switch between different storage methods without changing your core code. By default, it keeps logs in memory, but you can quickly change it to save them to a file (persistent storage) or disable logging altogether (dummy adapter).

The `_logFactory` property is a key internal component that handles creating the actual log utilities. The `getInstance` ensures that a log instance is made once and reused, which is helpful when the directory where logs are stored changes during backtesting. 

You can retrieve all logged entries using `getList`, and use methods like `log`, `debug`, `info`, `warn` to record different types of messages. To customize the logging behavior, you can specify a custom log adapter using `useLogger`, or switch to other built-in adapters using `usePersist`, `useMemory`, `useDummy`, or `useJsonl`. If the environment changes (like when the working directory changes), it's a good idea to call `clear` to refresh the log adapter and ensure accurate logging.


## Class LiveUtils

This class provides tools for live trading operations, acting as a central hub for tasks like running strategies and managing signals. It's designed to be easy to use and resilient, even if things go wrong. Think of it as a helper class that simplifies the complexities of live trading.

Here's a breakdown of what it offers:

*   **Running Strategies:**  You can start and monitor live trading for a specific symbol and strategy using the `run` function.  This process can recover from crashes by saving state to disk.  A background mode (`background`) lets you run trading without directly monitoring the results, ideal for tasks that run in the background.
*   **Signal Management:** It provides ways to retrieve and manage signals - whether they're pending, scheduled, or not present - with functions like `getPendingSignal`, `getScheduledSignal`, and `hasNoPendingSignal`.
*   **Position Information:** Access a wealth of data about an active position, including open costs, percentages closed, break-even points, entry prices, and profit/loss details.
*   **Control & Recovery:** Functions like `stop`, `commitClosePending`, and `commitCancelScheduled` allow you to influence and recover from ongoing strategies.
*   **Reporting:**  You can generate and save reports summarizing trading activity for analysis.
*   **Simplified Commitment:** It provides convenience methods like `commitAverageBuy` to handle common actions during live trading.
*   **Single Instance:** This class operates as a singleton, ensuring you're always interacting with the same instance, promoting consistency.

Essentially, this class encapsulates many common live trading functions, providing a clean and robust way to manage and monitor your strategies.

## Class LiveReportService

The LiveReportService helps you keep a detailed record of what's happening with your live trading strategies. It listens for events like when a strategy is idle, when a position is opened, actively trading, or closed, and saves these details.

This service connects to a live signal stream, capturing information about each trading tick and writing it to a database. It's designed to prevent accidental double-subscriptions to the signal, ensuring data integrity.

You can use the `subscribe` function to start receiving these live events, and `unsubscribe` to stop. The `loggerService` allows you to output debugging information. The `tick` property is where the real event processing happens.


## Class LiveMarkdownService

The LiveMarkdownService helps you automatically create reports detailing your live trading activity. It keeps track of what's happening during your trades—when a strategy is idle, when orders are opened or closed, and the overall performance. 

It works by listening to trading signals and accumulating information about each strategy you're using. Then, it turns this data into nicely formatted markdown tables, giving you insights like win rates and average profit/loss.

You can easily save these reports to your computer, organized by the symbol, strategy, exchange and timeframe, so you have a record of your trading performance. 

Here's a breakdown of what you can do:

*   **Subscribe and Unsubscribe:** It connects to your live trading data and allows you to disconnect when you're done.
*   **Gather Data:** You can request specific data or a full report for a particular trading strategy and symbol.
*   **Save Reports:** It saves reports to disk in a structured way.
*   **Clear Data:** You can clear the accumulated trading data, either for a specific trading setup or everything.

## Class LiveLogicPublicService

LiveLogicPublicService simplifies running live trading strategies by handling the complexities of context and state management for you.

It builds upon LiveLogicPrivateService, automatically passing along important information like the strategy name and exchange used, so you don't have to repeatedly specify it in your calls.

Think of it as a continuous, ongoing process that never truly ends, always ready to pick up where it left off, even if there’s a crash. 

It persistently saves its state so a restart doesn’t mean losing progress.

The `run` method is your primary tool for initiating a live trade, providing a stream of results (opened, closed, or cancelled signals) for a specific symbol, all while handling the underlying context automatically.


## Class LiveLogicPrivateService

This service manages the ongoing process of live trading, designed to be robust and efficient. It continuously monitors the market, checking for new trading signals. 

The core of the service is an infinite loop that streams results—specifically, when trades are opened or closed—avoiding unnecessary updates.  It's built to handle interruptions gracefully; if a crash occurs, it will automatically recover its state. 

The `run` method kicks off this process for a specific trading symbol, providing a stream of trading results you can work with.  Think of it as a constantly updated feed of important trading events. The service uses several dependencies to function including a logger, a strategy core, and method context, all managed behind the scenes.

## Class LiveCommandService

LiveCommandService acts as a central point for accessing live trading features within the backtest-kit framework. Think of it as a helper that simplifies how different parts of the system interact with live trading logic. 

It manages dependencies like logging, validation services, and the core live trading engine.

The `validate` function checks your trading strategy and its related risk settings, ensuring everything is set up correctly and doing so efficiently by remembering previous checks. 

The `run` method is the heart of live trading; it continuously processes data for a specific trading symbol, handling strategy execution and responding to events like trades opening, closing, or being canceled. It's designed to be robust and automatically recovers from crashes to keep the trading process running.


## Class IntervalUtils

The `IntervalUtils` class helps you control how often functions are executed, ensuring they only run once per specific time interval. It offers two ways to manage this: one keeps track of the execution in memory, and the other saves the state to a file, meaning it persists even if the program restarts. You can think of it as a gatekeeper that makes sure a function doesn't run too frequently.

There's a single, shared instance of this class called `Interval`, making it easy to use.

The `fn` method lets you wrap regular functions so they only execute once per interval. If a function returns `null`, it essentially pauses and tries again later.  Each unique function gets its own dedicated tracker.

The `file` method is similar but works with asynchronous functions and uses a file to remember whether a function has already run. This is useful for actions you want to be sure happen only once per interval, even if the application is stopped and started again. Again, each unique function gets its own dedicated persistent tracker.

You can manually clean up the internal trackers using `dispose` or `clear` if you need to reset the system. `resetCounter` helps avoid conflicts when the base directory changes between strategy runs.

## Class HighestProfitUtils

This class helps you analyze and report on the highest profit trades made by your strategies. Think of it as a tool for understanding which strategies performed best and why.

It gathers information from events tracking high-profit moments. 

You can use it to:

*   Get detailed statistics about the highest profits achieved for a particular trading symbol and strategy.
*   Generate a nicely formatted markdown report that summarizes all the highest profit events.
*   Save that markdown report directly to a file for later review or sharing.

It's designed as a central point for accessing and presenting this performance data.

## Class HighestProfitReportService

This service keeps track of your most profitable trades and records them for later analysis. It listens for signals indicating a new highest profit has been achieved and saves that information to a database file.

Think of it as a dedicated logbook for your best-performing trades.

The `subscribe` method is how you turn this service on; it connects to the system that’s sending those highest profit notifications.  Importantly, it only subscribes once to avoid redundant connections – any additional calls to subscribe will simply give you the same way to turn it off.

To stop the logging, use the `unsubscribe` method, which disconnects the service from the notification source. If you haven't subscribed, doing nothing.

The recorded information includes the date and time, the asset being traded, the strategy used, the exchange, the timeframe, and details about the trade signal itself, such as the position size and price levels.  This allows you to understand exactly what factors contributed to those profitable moments.


## Class HighestProfitMarkdownService

This service helps you create reports about your highest profit trades. It listens for data about those trades and organizes it based on the symbol, strategy, exchange, and timeframe you’re using.

You can subscribe to receive these trade events, but the service prevents you from subscribing multiple times. Unsubscribing clears all the collected data.

The `tick` function processes each incoming trade event, routing it to the right storage location.

You can retrieve the accumulated statistics (`getData`), generate a markdown report (`getReport`), or save the report directly to a file (`dump`). Reports include a table of recent events and the total number of events recorded.

Finally, you can clear the data, either for a specific combination of symbol, strategy, exchange, timeframe and backtest flag, or completely clear all accumulated data.

## Class HeatUtils

HeatUtils is a helper class designed to make it easier to analyze your portfolio's performance visually. It gathers and organizes statistics related to each symbol your strategies have traded.

Think of it as a central place to collect information and generate clear, readable reports that show how each symbol contributed to your overall portfolio results. 

You can use it to get a snapshot of your portfolio's performance, generating a table that breaks down key metrics like total profit/loss, Sharpe ratio, maximum drawdown, and trade count.  This table sorts symbols by profit, so you can quickly see which ones are performing best.

Finally, you can even save these reports directly to a file, creating a neat record of your strategies' past activity. It handles creating the necessary directories, making the process very straightforward.


## Class HeatReportService

The HeatReportService helps you track and understand your trading activity by recording when signals close, specifically focusing on the profit and loss (PNL) associated with those closures. It gathers this data for all your symbols, creating a portfolio-wide view.

Think of it as a reporter that listens for closed signals and logs the details. 

It then stores this information in a format suitable for generating heatmaps, which are helpful for analyzing patterns in your trading.

To ensure it doesn’t get overloaded, it prevents multiple subscriptions to the signal events. 

You can start it by subscribing and stop it by unsubscribing; the subscription method will give you a function to manage this.

## Class HeatMarkdownService

This service helps you visualize and analyze your trading performance using heatmaps. It listens for trading signals and gathers statistics for each strategy and symbol you're trading.

It keeps track of key metrics like total profit and loss, Sharpe Ratio, and maximum drawdown, both for individual symbols and your entire portfolio.

The service generates easy-to-read markdown reports summarizing your trading activity, sorted by performance. It also provides a way to save these reports directly to a file.

You can clear the accumulated data to start fresh or target specific strategies and trading environments. It also has a mechanism to prevent duplicate subscriptions to signal emitters.

The system remembers previously calculated heatmaps to speed up repeated analyses.

## Class FrameValidationService

This service helps you keep track of your trading timeframes, ensuring they're correctly set up before your strategies run. Think of it as a central place to register and verify your timeframe configurations. It lets you add new timeframes, check if a specific timeframe exists, and get a complete list of all the timeframes you’ve registered. The service also remembers its validation results, making the process faster and more efficient. It provides methods to add frames, validate their existence, and list all registered frames.

## Class FrameSchemaService

The FrameSchemaService helps you manage and organize your frame schemas, which are essentially blueprints for how your trading system operates. It uses a special registry to keep track of these schemas in a type-safe way, preventing errors caused by incorrect data.

You can add new frame schemas using the `register` method, and retrieve existing ones using the `get` method. If you need to update a schema, the `override` method lets you make partial changes without redefining the entire schema. Before a schema is registered, it’s checked for essential properties with the `validateShallow` process, ensuring it’s structured correctly. The service also has logging capabilities for tracking and debugging.

## Class FrameCoreService

FrameCoreService is a central component that handles the timing of your backtests. Think of it as the engine that provides the sequence of dates and times your trading strategy will be tested against. It works closely with FrameConnectionService to fetch this timeframe data and uses FrameValidationService to ensure everything's accurate. This service isn't something you'll typically interact with directly; it’s primarily used behind the scenes to power the backtesting process.

The `getTimeframe` function is the key method; you give it a symbol (like "BTCUSD") and a timeframe name (like "1h" for one-hour bars), and it returns a promise resolving to an array of dates representing the timeframe for that backtest.


## Class FrameConnectionService

The FrameConnectionService acts as a central hub for managing and accessing different backtest frames. It automatically routes requests to the correct frame implementation based on the current method context. To make things efficient, it caches these frame implementations, so they don’t need to be recreated every time.

Think of it like a smart router for your backtest frames.

This service also implements the IFrame interface and handles backtest timeframe management, including the start and end dates and the interval between data points. 

For live trading, the frameName will be empty, which means there are no frame constraints.

You can get a specific frame using `getFrame`, and the service takes care of creating it if it doesn't already exist.

The `clear` function is important for ensuring accurate backtests. It cleans out cached frame data, forcing the system to regenerate the timeframes – preventing it from using stale data and ensuring that it accurately reflects the most recent available candle data. The `getTimeframe` method lets you retrieve the specific start and end dates for a given symbol, which lets you limit your backtest to a specific time period.

## Class ExchangeValidationService

This service helps you keep track of your trading exchanges and makes sure they’re ready to go before you start any tests or real trading. It acts like a central manager for your exchange configurations, storing them in a registry. 

You can use it to register new exchanges with `addExchange()`, and it has a `validate()` function to confirm an exchange exists before you try to use it. To improve speed, it remembers the results of its validations, so it doesn’t have to check repeatedly. Finally, the `list()` function provides you with a complete overview of all the exchanges you’ve registered.


## Class ExchangeUtils

This class, `ExchangeUtils`, acts as a helpful assistant for interacting with different cryptocurrency exchanges. It's designed to make common tasks easier and more consistent, and it's available as a single, readily accessible instance.

You can use it to retrieve historical candle data, determine the average price (VWAP) of an asset, or get the latest closing price. It also handles the complexities of formatting quantities and prices to match the specific rules of each exchange.

If you need order book information or aggregated trade data, `ExchangeUtils` provides functions to fetch that as well. It allows you to get raw candle data with precise control over the date range and number of candles to retrieve, making it especially useful for backtesting strategies and handling potential look-ahead bias. Ultimately, `ExchangeUtils` simplifies the process of obtaining and organizing crucial data from various exchanges.

## Class ExchangeSchemaService

The ExchangeSchemaService helps keep track of different exchange configurations in a reliable and type-safe way. It acts as a central place to store and manage these configurations, ensuring they are consistent and valid.

You add new exchange configurations using `addExchange()`, and can find them later by their names using `get()`.

Before a new exchange configuration is saved, the system checks to make sure it has all the necessary information using `validateShallow`. This helps prevent errors down the line.

If you need to update an existing configuration, you can use `override()` to make partial changes without replacing the entire configuration. The service uses a special registry to safely store the exchange schemas.

## Class ExchangeCoreService

ExchangeCoreService acts as a central hub for all exchange-related operations within the system, making sure that relevant data like the trading symbol, time, and whether it's a backtest or live run are always factored in. It essentially combines the capabilities of connection and execution services to provide a consistent and context-aware interface.

It offers various functions for retrieving market data, including historical and future candles (specifically for backtesting), average prices, order books, and aggregated trades. These functions all handle execution context, meaning they're aware of the current trading environment. 

The service also includes methods for validating exchange configurations to ensure they’re correct and efficiently formatted price and quantity data. You can get the last known price or retrieve trade data, all while the system keeps track of when and where these actions are happening. It’s a fundamental component, primarily used behind the scenes by other key services to manage and interact with the exchange.

## Class ExchangeConnectionService

The `ExchangeConnectionService` acts as a central hub for interacting with different cryptocurrency exchanges. It intelligently directs requests like fetching candles, order book data, or trade information to the correct exchange based on the currently active exchange context. To improve performance, it remembers (caches) the connection to each exchange so you don't have to repeatedly establish them.

This service handles a wide variety of operations:

*   **Data Retrieval:** Easily get historical candles, the next batch of candles (useful for backtesting and live updates), the average price (calculated differently depending on whether you're backtesting or live), and the latest order book data.
*   **Formatting:** It ensures that prices and quantities are properly formatted to match the specific requirements of each exchange, handling things like precision and minimum lot sizes.
*   **Flexibility:** You can fetch raw candles, allowing you to specify start and end dates for more customized data retrieval.

Essentially, `ExchangeConnectionService` simplifies the process of working with multiple exchanges by abstracting away the complexities of connecting to and communicating with each one. It uses context to determine the appropriate exchange to use and caches connections to improve efficiency.

## Class DumpAdapter

The DumpAdapter helps you record different types of data—like messages, records, tables, errors, and JSON—during your backtesting process. Think of it as a flexible tool for saving snapshots of what's happening. 

It lets you choose where this data is stored, offering several options: writing to markdown files, keeping it in memory, or even discarding it entirely. The default is to generate markdown files, one per recording, organized by signal ID, bucket name, and dump ID.

Before you start recording, you need to 'enable' the adapter to make sure it's listening for the right signals. When you're finished, 'disable' it to clean up.

You can also customize the adapter by providing your own implementation. The `clear` function is useful to ensure fresh starts when your working directory changes.

## Class CronUtils

The `CronUtils` class, accessed via the `Cron` singleton, helps schedule tasks to run at specific times within backtesting environments. These tasks, like price updates or custom logic, are synchronized across parallel backtests, ensuring they fire only once per boundary.

Here's a breakdown:

**How it Works:**

It manages entries by name, tracking their generation to prevent interference from past or future registrations.  A key feature is ensuring only one handler executes per aligned time boundary, even with multiple backtests running concurrently. A promise is used as a mutex to coordinate these executions.

**Key Components:**

*   **Registration:** You register tasks with names, intervals, and specific symbols.
*   **Synchronization:** It intelligently handles fire-once and repeating tasks.
*   **Memory Management:** The framework includes mechanisms for cleaning up old entries and marks, preventing memory leaks.
*   **Lifecycle Integration:**  It integrates directly into the backtesting engine's lifecycle.

**Key methods:**

*   `register`: Adds a new cron entry.
*   `unregister`: Removes a previously registered entry.
*   `clear`: Clears fire-once flags, allowing those entries to run again.
*   `dispose`: Clears all entries, effectively resetting the scheduler.

The system ensures that tasks are executed exactly once at the expected time, even with multiple parallel backtests, and provides tools for managing and cleaning up the scheduled tasks.

## Class ConstantUtils

This class provides a set of predefined constants that are useful for setting take-profit and stop-loss levels in trading strategies. These levels are calculated using a method based on Kelly Criterion and exponential risk decay, designed to optimize profit capture while minimizing potential losses. 

The constants represent percentages of the total distance to the final target (either take profit or stop loss). For example, `TP_LEVEL1` (30) means that a take-profit is triggered when the price reaches 30% of the distance between the entry price and the ultimate take-profit target. These levels allow for a staged exit from a position, locking in profits incrementally and protecting against sudden reversals.

Here's a breakdown of the constants:

*   **TP_LEVEL1 (30):**  Triggers an early partial take-profit.
*   **TP_LEVEL2 (60):** Triggers a mid-level take-profit.
*   **TP_LEVEL3 (90):**  Triggers a final, almost complete exit.
*   **SL_LEVEL1 (40):**  A first warning signal for a stop loss.
*   **SL_LEVEL2 (80):**  A final exit stop loss.

## Class ConfigValidationService

The ConfigValidationService helps make sure your trading configurations are set up correctly and won't lead to losses. It checks a lot of different settings to catch potential problems before you start trading. 

It verifies that percentage-based settings like slippage and fees aren't negative.  More importantly, it ensures your take profit distance is large enough to cover all trading costs – slippage and fees – so you actually make money when your target is hit.

The service also makes sure that limits and ranges are set up logically, such as ensuring stop-loss distances are reasonable, and that timeout and retry values are positive integers. Finally, it validates parameters related to how candle data is fetched, like retry attempts, delays and anomaly detection thresholds.

## Class ColumnValidationService

This service helps make sure your column configurations are set up correctly. It's designed to catch errors early on, ensuring consistency and preventing problems later when your application uses these column definitions.

The service performs a thorough check on all your column configurations, looking for a few key things. It verifies that each column has all the necessary properties – a unique key, a descriptive label, a formatting function, and a visibility function.  It also ensures that the key and label are strings and that those keys are unique within their group, and that the functions are actually functions.  Essentially, this service acts as a safety net to maintain the integrity of your column data.

## Class ClientSizing

This component handles the crucial task of determining how much of your assets to allocate to each trade. Think of it as the risk management engine, ensuring trades are appropriately sized. It allows you to define different sizing methods, such as a fixed percentage of your capital, a Kelly criterion approach, or based on Average True Range (ATR) volatility.

You can also set limits on the minimum and maximum position sizes, as well as a percentage cap on how much of your capital can be used in any single trade. It’s designed to be flexible, allowing you to add custom validation checks and logging capabilities to fine-tune your sizing strategy. The `calculate` method is the heart of this process, taking parameters and returning the calculated position size for a trade.


## Class ClientRisk

ClientRisk helps manage risk across your trading strategies, ensuring they don't exceed predefined limits. Think of it as a safety net preventing signals from being executed if they would violate those limits, like exceeding the maximum number of concurrent positions or failing custom validations.

It’s shared by multiple strategies, allowing for a comprehensive view of portfolio-level risk. This shared approach helps catch potential problems that might be missed if each strategy operated in isolation.

**How it works:**

*   **Constructor:** You set up the risk parameters when you create a ClientRisk object.
*   **Active Positions:** Keeps track of all open positions across all strategies.
*   **`checkSignal`:** This is the primary method for assessing whether a new signal should be allowed. It considers factors like the signal’s details and current positions. If any validation fails, the signal is blocked.
*   **`checkSignalAndReserve`:** This is a critical safety measure to prevent over-allocation of resources when multiple strategies are running concurrently. It secures a slot in the position map *before* the signal is fully processed, ensuring concurrency safety.  You *must* either `addSignal` (complete the position creation) or `removeSignal` (cancel the position creation) after using this.  Failing to do so leads to stale reservations.
*   **`addSignal`:**  Used to register a newly opened position.
*   **`removeSignal`:** Used to remove a closed position.

The system automatically persists and loads active positions, but this feature is skipped during backtesting to speed things up.

## Class ClientFrame

The `ClientFrame` is responsible for creating the sequences of timestamps that your backtesting process uses to step through historical data. Think of it as the engine that provides the time-based framework for your simulations. 

It cleverly avoids re-calculating timeframes if you need them multiple times for the same period, saving valuable processing power. You can adjust the spacing of these timeframes, choosing intervals from one minute to one day. 

It also allows you to add custom checks or logging functions to ensure the timeframes are correct and to track what’s happening during their creation. The `ClientFrame` works closely with the core backtesting engine to manage the timing of your trades.

The `getTimeframe` function is how you actually get those timestamp sequences – it generates them and remembers them to be efficient.

## Class ClientExchange

This `ClientExchange` component acts as a bridge to get data from an exchange, specifically designed for backtesting. It handles fetching historical and future candle data, calculating the Volume Weighted Average Price (VWAP) based on recent trades, and formatting prices and quantities according to the exchange's rules. It's built to be efficient and prevent look-ahead bias, ensuring your backtest results are accurate.

Here’s a breakdown of what it does:

*   **Candle Data:** It can retrieve past and future candles, essential for simulating trades. It ensures the timing aligns correctly with the backtest context.
*   **VWAP Calculation:**  It can determine the VWAP, which is a key indicator of trading activity, based on recent trade data.
*   **Formatting:** It automatically formats the price and quantity values to match the exchange's specific rules.
*   **Order Book & Trades:** You can also fetch order book information and aggregated trades.
*   **Flexible Retrieval:** The `getRawCandles` function allows for flexible fetching of candles with custom start and end dates and limits. 
*   **Memory Efficient:**  It's designed to be efficient by using prototype functions to reduce memory consumption.



Essentially, `ClientExchange` simplifies the process of getting the data needed to run and evaluate your trading strategies in a backtesting environment.

## Class ClientAction

The `ClientAction` component is a key piece for integrating custom logic into your trading strategy. Think of it as a central hub that manages and routes different types of events to your custom action handlers.

It initializes your handler only once, ensuring efficient resource use. It also provides a clean way to handle various events like signal updates (from live or backtest modes), profit/loss level triggers, scheduled tasks, and order confirmations. It gives you flexibility to manage tasks like logging, notifications, or integrating with external analytics platforms.

You can connect these events to specific callbacks that you define, essentially letting you orchestrate complex behavior within your strategy's execution flow. The system utilizes a "singleshot" mechanism for initialization and cleanup to avoid redundant actions. It also supports manual wiring for scheduled events and pending orders. There are specialized event handlers for different situations, like risk rejections and order synchronization, designed to keep your strategy running smoothly and safely.

## Class CacheUtils

This utility class, CacheUtils, helps you easily cache the results of your functions, which can significantly speed up backtesting. It acts as a central point for managing these caches, ensuring they are invalidated at appropriate times based on your trading timeframe.

You can use `fn` to wrap regular functions, automatically storing and retrieving their results based on the interval you define. This means the function only needs to recalculate if the timeframe changes.

Similarly, `file` lets you cache the results of asynchronous functions by writing them to disk. This makes caching persistent across sessions and is particularly useful for functions that take a long time to execute.  Each unique function gets its own isolated cache, and consistent function references are key to reusing the cache.

If you need to clear the existing cached data for a specific function, `dispose` will remove it, forcing a recalculation next time.

To ensure the cache is refreshed when your project directory changes, you can use `clear` to wipe out all existing caches.  `resetCounter` also helps with this refresh by resetting the index used for file-based caches.

## Class BrokerBase

This class provides a base for creating custom broker adapters, allowing your trading framework to interact with different exchanges. It's designed to be extended rather than implemented from scratch.

Think of it as a blueprint for connecting to a real exchange.  You can customize it to handle things like placing orders, managing stop-loss and take-profit levels, and tracking positions on an external system.

The framework automatically handles logging events as they occur.

**How it Works**

1. **Initialization:** `waitForInit()` lets you set up your connection, like logging into an exchange. This happens *before* the first trade.
2. **Event Handling:** Various `on...Commit` methods get called when specific actions happen – opening/closing positions, hitting stop-loss/take-profit levels, or placing partial orders. You customize these methods to interact with your chosen exchange.
3. **No-Op Defaults:**  All the event methods (`onOrderOpenCommit`, `onOrderCloseCommit`, etc.) have default implementations that just log what’s happening.  If a particular exchange doesn’t need an action, you don't have to override anything.

**Key Features**

*   **Extendable:** Build on the foundation of this class to create custom adapters.
*   **Automated Logging:** Automatic logging of all events makes debugging easier.
*   **Comprehensive Interface:** Implements all necessary methods for broker functionality.
*   **Lifecycle Management:** Handles initialization, event triggering, and doesn't require explicit cleanup.

**Specific Events**

*   `onOrderOpenCommit`: Places an order to enter a position.
*   `onOrderCloseCommit`:  Executes an order to close the position.
*   `onPartialProfitCommit`: Places an order for a partial close at a profit.
*   `onPartialLossCommit`: Places an order for a partial close at a loss.
*   `onTrailingStopCommit`:  Updates the trailing stop-loss level.
*   `onTrailingTakeCommit`: Updates the trailing take-profit level.
*   `onBreakevenCommit`: Moves the stop-loss to the entry price.
*   `onAverageBuyCommit`: Adds a new average-down (DCA) buy order.



This class simplifies the process of connecting your backtesting and trading framework to an exchange by providing a structured, easily extensible foundation.

## Class BrokerAdapter

The `BrokerAdapter` acts as a middleman between your trading strategies and the actual broker, providing a consistent way to handle order commitments and notifications. It’s a key component for both live trading and backtesting.

Think of it like a transaction controller: it intercepts actions like opening, closing, and pinging orders *before* they are applied to the core trading data. If anything goes wrong during these actions, the whole operation is rolled back, ensuring data consistency.

During backtesting, the `BrokerAdapter` essentially does nothing, silently skipping the broker interactions. This allows for fast and efficient simulations. In live trading, it passes the information to the real broker.

It handles events like new orders, cancellations, and status updates, automatically routing them to the registered broker. Specific actions like partial profit taking, loss limiting, and trailing stops are also intercepted and controlled.

You configure the `BrokerAdapter` by registering a broker adapter (either a class or an instance) and then activating it with `enable()`. This subscribes to the necessary event streams. When you’re done, you can deactivate it with `disable()`. The `clear()` function resets the adapter and is useful when your trading environment changes.


## Class BreakevenUtils

This class helps you understand and analyze breakeven events that have occurred during trading. Think of it as a central hub for gathering and presenting information about these events. It collects data about when breakeven conditions were met, including details like the symbol traded, the strategy used, the price at entry, and the current price.

You can use this class to get statistical summaries of breakeven events to see overall trends.

It can also generate detailed reports in Markdown format, essentially creating tables that list each breakeven event with all its important details.  These reports can then be saved to files for later review or sharing.

Finally, the `dump` function provides a convenient way to automatically create these reports and save them to a specified file path, complete with a nicely formatted filename.

## Class BreakevenReportService

The BreakevenReportService helps you keep track of when your trading signals reach their breakeven point. It's designed to listen for these "breakeven" moments and automatically record them.

Think of it as a system that observes your trading signals and saves important details about when each one becomes profitable enough to cover your initial investment.

It uses a database (specifically SQLite) to store these records, allowing you to analyze your signal performance over time.

To use it, you'll subscribe to a signal emitter to receive the breakeven events, and when you're done, you can unsubscribe to stop the service. The subscription process is managed to prevent accidental double-subscriptions.

## Class BreakevenMarkdownService

The BreakevenMarkdownService is designed to automatically create and save reports detailing breakeven events for your trading strategies. It listens for these events and organizes them by symbol and strategy. 

The service then generates easy-to-read markdown tables containing the event information and provides useful statistics like the total number of breakeven events. 

These reports are saved to your computer, organized into directories for easy access. You can subscribe to receive breakeven events, and unsubscribe when you no longer need them. The service also lets you retrieve data, generate reports, dump them to disk, and clear all accumulated data or just data for a specific symbol and strategy.

## Class BreakevenGlobalService

The BreakevenGlobalService acts as a central hub for managing breakeven tracking within the system. It’s a relatively simple component that ensures a single point of access for strategies and provides a place to log breakeven-related activities.

It relies on other services – like a logger, connection service, and various validation services – which are injected to handle specific tasks. This design allows for easy monitoring and control of how breakeven calculations are performed.

The service’s primary functions involve validating strategy configurations and determining whether a breakeven trigger should occur.  It essentially checks if conditions are met and if so, initiates the necessary actions while keeping a record of the process.  It also handles clearing the breakeven state when a signal closes. Think of it as a gatekeeper and recorder for all breakeven events, ensuring consistency and transparency.


## Class BreakevenConnectionService

The BreakevenConnectionService manages and provides breakeven tracking functionality. It's designed to efficiently handle breakeven calculations for different signals, creating and storing only one breakeven tracking object per signal ID.

Think of it as a central hub for breakeven information. It receives information about signals and prices, and then decides whether a breakeven condition has been met.

The service keeps track of these breakeven tracking objects using a caching mechanism, so it doesn’t have to recreate them every time. When a signal is finished, it cleans up these tracking objects to prevent unnecessary memory usage.

It works closely with other parts of the system, receiving data and using those data to manage the breakeven tracking. The service keeps a record of when it checks for breakevens and reports these events to the broader system.

## Class BacktestUtils

This utility class offers convenient shortcuts for running backtests and retrieving information about strategies. It acts as a central point for common backtesting operations, using a singleton instance for ease of access.

You can use it to run backtests for a specific symbol and strategy, or to execute them in the background without immediately processing the results. It also provides methods for getting pending or scheduled signals, checking for their existence, and retrieving key data points like total percentage closed, cost basis, and effective entry price.

Furthermore, it offers tools for managing signals, such as canceling scheduled signals or prematurely activating them. The class also facilitates partial position closures and provides ways to adjust trailing stop-loss and take-profit levels.  It generates and saves reports summarizing backtest performance and offers a way to retrieve statistical data and list active backtest instances. Finally, it allows pausing and resuming the backtest process.

## Class BacktestReportService

The BacktestReportService helps you keep a detailed record of what's happening during your backtests. It acts like a diligent observer, tracking the lifecycle of each trading signal – from when it's just sitting idle to when it's actively open and finally closed.

It listens to the backtest’s activity and logs every significant event, including all the details about each signal. This information is then stored in a database, allowing you to easily analyze your strategy's performance and debug any issues that might arise.

To get started, you'll need to subscribe to the backtest signal events. This ensures the service receives updates and logs them appropriately. You can later unsubscribe to stop the logging process. The service is designed to prevent accidental double-logging by ensuring only one subscription is active at a time.

## Class BacktestMarkdownService

The BacktestMarkdownService helps you create and save detailed reports about your trading backtests. It works by listening for trading signals as they happen and carefully tracking the results of completed trades for each strategy. 

It organizes this information and converts it into easy-to-read markdown tables, which are then saved as files on your computer, typically in a `logs/backtest` folder. Each report is named after the strategy you used.

You can request data and reports for specific symbols, strategies, exchanges, and timeframes. The service uses a clever storage system that keeps the data for each unique combination of these factors separate. 

It provides functions to retrieve accumulated statistics, generate the markdown reports, save those reports to disk, and clear out the recorded data when you're finished with a backtest. 

To use it, you need to "subscribe" to the backtest events so it can start collecting data; and when finished, you "unsubscribe" to stop the data collection.

## Class BacktestLogicPublicService

This service helps run backtests and automatically handles important details like which trading strategy, exchange, and data frame are being used. It simplifies the process by making sure the right context is available when your strategy needs to access data or generate signals – you don't have to pass it around manually.

It’s built on top of another service, `BacktestLogicPrivateService`, and includes tools for managing time, data schemas, and connections to exchanges.

The core function is `run`, which takes a symbol (like "BTCUSDT") and context information and then streams backtest results, effectively simulating trades. This streaming approach lets you process and analyze results as they come in, instead of waiting for the entire backtest to finish.


## Class BacktestLogicPrivateService

The BacktestLogicPrivateService manages the process of running a backtest, handling data in a way that’s efficient for large datasets. It works by first getting the available timeframes from a frame service. Then, it goes through each timeframe, checking for signals.

When a signal appears, the service fetches the necessary historical data (candles) and then executes the backtest logic. Importantly, it skips over any timeframes where the signal is still active.

As the backtest progresses, it provides results incrementally – specifically, when a signal closes. These results are delivered as a stream, rather than storing everything in memory at once, which is a huge advantage when dealing with a lot of data. The process continues until the entire backtest is complete, allowing for potential early termination if needed.

The service relies on several core components like the strategy core, exchange core, frame core, action core, time meta, and price meta services to function correctly. It also provides access to logging and context information through the `loggerService`.

## Class BacktestCommandService

This service acts as a central hub for running backtests within the framework. Think of it as the main access point to the backtesting engine.

It bundles together several other services, like those handling strategy validation, risk assessment, and exchange specifics, making it easier to manage dependencies.

The `validate` function checks your strategy and its risk settings to make sure everything is configured correctly. It's designed to be efficient, remembering previous checks to avoid unnecessary repetition.

You can initiate a backtest using the `run` function, specifying the trading symbol and providing context like the strategy, exchange, and frame names you want to use. This function will generate a sequence of results representing the simulated trades.

## Class ActionValidationService

The ActionValidationService helps keep track of your action handlers, ensuring they're available when you need them. Think of it as a central place to register and verify the existence of these handlers. 

It's designed to be efficient by remembering which handlers exist for specific actions, so it doesn't have to re-check them repeatedly. 

You can use it to add new action schemas with `addAction`, confirm that a handler exists with `validate`, and get a full list of registered handlers with `list`.  This service provides a way to manage and validate your action handlers, preventing errors and improving the reliability of your trading system.


## Class ActionSchemaService

This service is responsible for keeping track of and managing different types of actions your application can perform. Think of it like a central directory for all your actions, ensuring they're structured correctly and safe to use.

It uses a special way of storing these action "blueprints" which guarantees type safety, meaning fewer errors down the road. When you define actions, it checks to make sure your code is using only the methods it's supposed to, preventing unexpected behavior.

The service lets you add new actions, update existing ones (without having to redefine them entirely), and retrieve the complete details of an action when you need them. It validates actions as you add or change them, so you know they’re set up correctly. The `register` method is how you add a new action, ensuring it's structurally sound and has approved methods. `override` lets you make small changes to an existing action without creating a whole new one. Finally, `get` allows you to look up the full definition of an existing action.


## Class ActionProxy

ActionProxy acts as a safety net when using custom code within the trading framework. It essentially "wraps" your action handlers – the code that responds to things like new signals or profit targets – and protects the entire system from crashing if your code has errors.

Think of it as an intermediary; whenever your code needs to run, ActionProxy steps in first. It’s designed to be robust, even if some of your action handlers are incomplete (missing certain methods) or contain errors.

Here's a breakdown of what it does:

*   **Error Prevention:** Any errors in your custom action handler code are caught and logged. This keeps the trading process running smoothly even if something goes wrong.
*   **Handles Various Events:** It provides methods (like `signal`, `signalLive`, `dispose`) that are triggered by different events during trading – backtesting, live trading, profit taking, etc.  Each of these methods is protected by the error-catching mechanism.
*   **Factory Pattern:**  You don’t create ActionProxy instances directly. Instead, you use the `fromInstance` method to create them, which helps maintain consistency and control.
*   **Special Cases:** A couple of methods (`orderSync` and `orderCheck`) deliberately *don't* have the error-catching protection. They're designed to immediately propagate errors so those situations are handled with maximum precision.
*   **Flexibility:** It allows developers to create custom logic while maintaining a controlled and stable environment for the trading system.

## Class ActionCoreService

The ActionCoreService acts as a central hub for handling actions within your trading strategies. It’s like a traffic controller, ensuring that the right actions are executed at the right time.

Essentially, it takes action lists defined in strategy schemas and manages their execution. It validates the strategy's setup, including names and risks, and then sequentially invokes handlers for each action.

Here's a breakdown of its key functions:

*   **Initialization:** `initFn` sets up individual actions, pulling in any needed data.
*   **Signal Handling:**  `signal`, `signalLive`, `signalBacktest` distribute incoming data (ticks) to the appropriate actions, triggering responses. Each of these handles different modes (live trading, backtesting).
*   **Event Routing:** It has specialized methods (`breakevenAvailable`, `partialProfitAvailable`, etc.) for dealing with various events like profit targets, scheduled tasks, and risk rejections.  Each one takes the relevant event data and passes it to the associated actions.
*   **Validation:** `validate` checks the strategy's context to confirm everything is configured correctly, preventing errors later on.
*   **Disposal:** `dispose` cleans up resources when a strategy is finished.
*   **Synchronization & Checks:** Methods like `orderSync` and `orderCheck` coordinate actions related to order management.
*   **Data Clearing:** `clear` removes stored action data, either for specific actions or globally.

The service uses a series of other services to validate and manage different parts of the strategy and its environment, ensuring smooth and reliable operation.

## Class ActionConnectionService

The ActionConnectionService acts as a central hub for directing different types of actions to the correct handlers within your trading system. Think of it as a dispatcher that ensures each action—like signaling a new tick or handling a breakeven event—goes to the right place.

It efficiently manages these actions by using caching, so frequently used action handlers don't have to be recreated repeatedly, which speeds things up. The service uses information like the action's name, the strategy being used, and the specific frame it applies to when deciding where to send the action.

It also provides specialized methods for handling various events, including signals, profit/loss adjustments, scheduled tasks, and order-related actions. Each method ensures the event is delivered to the intended ClientAction instance for processing. Clearing cached actions is also available, enabling refreshing actions.

## Class ActionBase

This class, `ActionBase`, is designed to simplify creating custom actions for your trading strategies. It provides a foundation for handling events like signals, breakeven adjustments, partial profit/loss milestones, and more. Think of it as a starting point to extend and customize how your strategy interacts with external systems – whether that's sending notifications, tracking performance, or triggering custom logic.

It automatically handles logging events and gives you access to key details about the strategy and the action being performed. You don’t have to implement every possible event handler; just focus on the ones you need for your specific task.

Here's a breakdown of the lifecycle:

1.  When an action is created, it's initialized with details about the strategy and action name.
2.  `init()` lets you set up resources like database connections or API keys once at the beginning.
3.  Various event methods like `signal()`, `breakevenAvailable()`, and `pingScheduled()` are called during strategy execution, allowing you to react to different situations.
4.  Finally, `dispose()` is called to clean up any resources when the strategy is finished.

The framework provides default logging for all events, but you can override the methods to perform custom actions based on the triggers. The framework distinguishes between live and backtest modes, allowing actions specific to each to be triggered.
