---
title: docs/internals
group: docs
---

# backtest-kit api reference

![schema](../assets/uml.svg)

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

**Architecture Layers:**

* **Client Layer:** Pure business logic without DI (ClientStrategy, ClientExchange, ClientFrame) using prototype methods for memory efficiency
* **Service Layer:** DI-based services organized by responsibility:
  * **Schema Services:** Registry pattern for configuration (StrategySchemaService, ExchangeSchemaService, FrameSchemaService)
  * **Connection Services:** Memoized client instance creators (StrategyConnectionService, ExchangeConnectionService, FrameConnectionService)
  * **Global Services:** Context wrappers for public API (StrategyGlobalService, ExchangeGlobalService, FrameGlobalService)
  * **Logic Services:** Async generator orchestration (BacktestLogicPrivateService, LiveLogicPrivateService)
* **Persistence Layer:** Crash-safe atomic file writes with PersistSignalAdaper

**Key Design Patterns:**

* **Discriminated Unions:** Type-safe state machines without optional fields
* **Async Generators:** Stream results without memory accumulation, enable early termination
* **Dependency Injection:** Custom DI container with Symbol-based tokens
* **Memoization:** Client instances cached by schema name using functools-kit
* **Context Propagation:** Nested contexts using di-scoped (ExecutionContext + MethodContext)
* **Registry Pattern:** Schema services use ToolRegistry for configuration management
* **Singleshot Initialization:** One-time operations with cached promise results
* **Persist-and-Restart:** Stateless process design with disk-based state recovery

**Data Flow (Backtest):**

1. User calls BacktestLogicPrivateService.run(symbol)
2. Async generator with yield streams results
3. MethodContextService.runInContext sets strategyName, exchangeName, frameName
4. Loop through timeframes, call StrategyGlobalService.tick()
5. ExecutionContextService.runInContext sets symbol, when, backtest flag
6. ClientStrategy.tick() checks VWAP against TP/SL conditions
7. If opened: fetch candles and call ClientStrategy.backtest(candles)
8. Yield closed result and skip timeframes until closeTimestamp

**Data Flow (Live):**

1. User calls LiveLogicPrivateService.run(symbol)
2. Infinite async generator with while(true) loop
3. MethodContextService.runInContext sets schema names
4. Loop: create when = new Date(), call StrategyGlobalService.tick()
5. ClientStrategy.waitForInit() loads persisted signal state
6. ClientStrategy.tick() with interval throttling and validation
7. setPendingSignal() persists state to disk automatically
8. Yield opened and closed results, sleep(TICK_TTL) between ticks

**Performance Optimizations:**

* Memoization of client instances by schema name
* Prototype methods (not arrow functions) for memory efficiency
* Fast backtest method skips individual ticks
* Timeframe skipping after signal closes
* VWAP caching per tick/candle
* Async generators stream without array accumulation
* Interval throttling prevents excessive signal generation
* Singleshot initialization runs exactly once per instance

**Use Cases:**

* Algorithmic trading with backtest validation and live deployment
* Strategy research and hypothesis testing on historical data
* Signal generation with ML models or technical indicators
* Portfolio management tracking multiple strategies across symbols
* Educational projects for learning trading system architecture


# backtest-kit functions

## Function stopRun

The `stopRun` function lets you halt a backtest or live trading simulation for a specific trading pair. Think of it as an emergency stop button – if you need to immediately pause a test or trade execution for a particular symbol, this is how you do it. You simply provide the symbol of the trading pair you want to stop, and the framework will cease any ongoing activities related to it. It's useful for quickly interrupting a test to examine the state or stopping a trade that's behaving unexpectedly. The function takes only one argument: the symbol string representing the trading pair.

## Function stopAll

This function provides a simple way to halt all ongoing backtesting processes within the backtest-kit framework. It's like hitting a global "pause" button – it brings everything to a standstill. Think of it as a safety measure to quickly stop a test if something unexpected happens or you want to examine the state of the backtest. It doesn't clear any data or results, just stops the simulation.


## Function startRun

The `startRun` function is your starting point for running backtests. It takes a configuration object, which tells the backtest-kit how you want your simulation to run. Think of this configuration as setting up the stage for your trading strategy – specifying the data to use, the strategy to execute, and how the results should be recorded. Calling this function kicks off the entire backtesting process, allowing you to see how your strategy would have performed against historical data. It’s a simple way to begin evaluating your trading ideas.

## Function setLogger

This function lets you plug in your own logging system for the backtest-kit framework. Instead of the default logging, all messages generated by the framework – things like strategy decisions, exchange events, and performance data – will now be sent to the logger you provide.  The framework will automatically add helpful details to each log message, such as the strategy name, exchange, and trading symbol, so you have more context. You just need to create a logger that conforms to the `ILogger` interface and pass it in.

## Function runBacktestGUI

The `runBacktestGUI` function lets you visually test your trading strategies using a graphical user interface. You provide it with a trading symbol, like "BTCUSDT," and an array of specific timestamps representing the historical data you want to use for the backtest. The function then launches a GUI where you can observe how your strategy would have performed against that historical data, allowing you to tweak and refine it. It’s a really useful way to get a clear picture of your strategy’s potential before deploying it live.



The function doesn't return a value directly; instead, it opens the GUI and you interact with that.

## Function runBacktest

The `runBacktest` function is the heart of backtest-kit, allowing you to test your trading strategies against historical data. You provide it with a trading symbol, like "BTCUSDT", and an array of timestamps representing the historical data you want to use.  The function then runs your backtesting logic against that data.  Ultimately, it returns a `IBacktestResult` object, which contains all the key performance metrics and details about how your strategy performed during the backtest. Think of it as the engine that actually executes your backtest and gives you the results you need to evaluate your strategy.


## Function reduce

The `reduce` function is your tool for processing historical data in backtest-kit, letting you combine information from different timeframes into a single, meaningful value. Think of it as a way to summarize a series of data points, like calculating the cumulative volume traded over a specific period. You give it a symbol, a list of timestamps, a function to perform the calculation on each timeframe (your "reducer" function), and a starting value. The function then iterates through the timestamps, applying your reducer function to each, and ultimately returns a final result based on the accumulated values. This is useful for things like calculating moving averages or generating custom indicators.

## Function getMode

This function tells you whether the trading framework is currently running a backtest or if it's operating in live trading mode. It returns a promise that resolves to either "backtest" or "live", giving you a simple way to adjust your code's behavior depending on the environment. This is handy for things like disabling certain features during backtesting or adjusting logging levels. Essentially, it’s a quick way to know if you’re looking at historical data or real-time transactions.

## Function getDate

This function, `getDate()`, provides a simple way to retrieve the current date within your trading strategy. It's like asking the backtest-kit, "What date are we working with right now?". When running a backtest, it returns the date associated with the specific timeframe you're analyzing. If you're running in live trading mode, it will give you the actual current date and time. It's useful for things like conditional logic based on specific dates or for displaying information in your trading interface.

## Function getCandles

This function helps you retrieve historical price data, like open, high, low, and close prices, for a specific trading pair. Think of it as grabbing a series of snapshots of the market over time. 

You tell it which trading pair you're interested in (like BTCUSDT), how frequent the data should be (every minute, every 3 minutes, etc.), and how many data points you want. 

The function then connects to the exchange where you've registered your data sources and pulls the requested historical candle data. This is a core function for things like backtesting trading strategies.

## Function getAveragePrice

This function helps you find the Volume Weighted Average Price, or VWAP, for a specific trading symbol like BTCUSDT. It looks back at the last five minutes of trading data, specifically the high, low, and close prices of each minute, to calculate this average. If there's no trading volume recorded, it falls back to a simple average of the closing prices instead. You simply provide the symbol you're interested in, and it returns a promise that resolves to the calculated average price.

## Function formatQuantity

This function helps you prepare the right amount to trade, ensuring it follows the specific rules of the exchange you're using. It takes a trading pair, like "BTCUSDT," and the raw quantity you want to trade, then formats it correctly. The result is a string representation of the quantity that’s ready for submitting orders. Essentially, it handles the complexities of decimal places and other exchange-specific formatting, so you don't have to.


## Function formatPrice

This function helps you display prices correctly for different trading pairs. It takes the symbol of the trading pair, like "BTCUSDT", and the raw price value as input. It then uses the specific formatting rules for that exchange to make sure the price is shown with the right number of decimal places. This is important because different exchanges handle price precision differently, and this function handles that complexity for you. It returns a formatted string representation of the price.

## Function addStrategy

This function lets you officially add a trading strategy to the backtest-kit framework. Think of it as registering your strategy so the system knows about it and can manage it properly. When you add a strategy this way, it automatically checks to make sure your strategy's signals are valid – like ensuring price data is correct and your take-profit/stop-loss logic is sound. It also handles a useful feature that prevents signal flooding, and ensures your strategy data survives even if the system unexpectedly crashes when you're running live. To register your strategy, you need to provide a configuration object that defines how it operates.

## Function addFrame

This function lets you tell backtest-kit how to generate the timeframes it will use for your backtesting simulations. Think of it as defining the "schedule" for your backtest – specifying the start and end dates, and the frequency (interval) of the data it needs. You provide a configuration object that outlines these details, and the framework uses this information to create the timeframes for your analysis. Essentially, it’s how you set up the historical data that your backtest will operate on.


## Function addExchange

This function lets you tell backtest-kit about a new data source for trading, like a specific cryptocurrency exchange. Think of it as connecting the framework to a place where it can pull historical price data. You provide a configuration object that describes how to access that exchange’s data, including how to retrieve historical candles, format prices and quantities, and calculate volume-weighted average price (VWAP). Each exchange needs to be registered before you can use its data in your backtesting strategies.

# backtest-kit classes

## Class StrategySchemaService

The StrategySchemaService helps you keep track of your trading strategy blueprints in a safe and organized way. It acts like a central repository for strategy schemas, ensuring consistency and allowing you to easily access and update them. 

Think of it as a library where you can add new strategy designs (using `addStrategy()`), modify existing ones (`override()`), and quickly find a specific strategy by its name (`get()`). It uses a special system for type safety, so you can be sure your schemas are structured correctly. The service also keeps a record of what’s happening with logging through its loggerService property.

## Class StrategyGlobalService

StrategyGlobalService helps you interact with your trading strategies, providing a way to execute them within a specific environment. It essentially combines two other services to manage how strategies run, making sure they have the right information like the symbol being traded, the time, and whether it's a backtest or live trading.

You can use it to quickly check the status of a strategy at a particular time, like seeing if a signal was generated. It also provides a handy tool for running fast backtests against historical candle data, giving you a glimpse of how your strategy might perform. 

Think of it as a central point for running and evaluating your strategies with the right context.

## Class StrategyConnectionService

The StrategyConnectionService acts as a central hub for interacting with your trading strategies. It automatically figures out which specific strategy implementation to use based on the current context. 

Think of it as a smart router – you call a method, and it directs that call to the correct strategy. To keep things efficient, it remembers which strategies it’s already loaded, so it doesn't have to create new ones every time.

Before you can actually trade or backtest, it requires a little setup, which you’ll need to ensure has completed. The `tick` method handles live trading updates, analyzing market conditions to generate signals.  The `backtest` method lets you test your strategy’s performance against historical data, giving you valuable insights into its potential. 

It relies on several other services to do its job, including services that handle logging, context, schema, exchange connections, and method context. The `getStrategy` property is its internal mechanism for retrieving and managing the strategy instances.

## Class PersistSignalUtils

This class, PersistSignalUtils, helps manage how signal data is saved and loaded for your trading strategies. It ensures that your strategies can remember their state even if the application restarts or experiences issues. 

The class provides a way to store signal data for each strategy individually, and it's designed to work reliably by using special techniques to prevent data corruption, even in unexpected situations like crashes. You can also customize how the data is stored by using your own persistence adapters.

Specifically, `readSignalData` retrieves previously saved signal information, useful for restoring a strategy to its last known state. `writeSignalData` saves the current signal data, ensuring that changes are persisted safely. The `usePersistSignalAdapter` method lets you plug in your own method for storing data, providing flexibility for different storage requirements.

## Class LoggerService

The LoggerService helps you keep your backtesting logs organized and informative. It's designed to consistently add important details to your log messages, like which strategy, exchange, and frame are being used, along with information about the symbol, time, and whether it’s a backtest. 

You can use the default logging behavior, or you can provide your own custom logger. The service injects context automatically, so you don’t have to manually add this information each time. It uses a `methodContextService` and `executionContextService` to manage this context. If you don't set up a logger, it will default to a "no-op" logger, meaning nothing is logged. 

The `setLogger` method is how you swap in your own logging implementation.

## Class LiveUtils

This class, `LiveUtils`, provides helpful tools for live trading, making it easier to manage the process. Think of it as a single, always-available helper for running your trading strategies in a live environment.

The core of this class is the `run` method, which kicks off a continuous, never-ending stream of trading data.  It handles the complexities of running your strategy, including things like keeping track of progress even if your program unexpectedly crashes. The `run` method also passes along important information about your strategy, like its name and the exchange and timeframe it's using.  This ensures everything is properly linked and recorded.

## Class LiveLogicPublicService

This service helps orchestrate live trading, making it easier to manage the context needed by your trading strategies. Think of it as a layer on top of the private service that automatically handles things like the strategy name and exchange – you don't have to pass them around explicitly.

It continuously streams trading signals (both buy and sell events) as an ongoing process, and it’s designed to run indefinitely. 

If things go wrong and the process crashes, it's built to recover and pick up where it left off, using saved state. It keeps track of time using the system clock, ensuring real-time progression. 

Essentially, it's a robust and convenient way to run your live trading strategies with automatic context management and crash resilience.


## Class LiveLogicPrivateService

This service is designed to power live trading, constantly monitoring a specific trading symbol. It works by continuously checking for signals and providing updates as it identifies new trades being opened or closed. Think of it as a live feed of your trading activity.

The service is built to be robust; if something goes wrong, it automatically recovers and picks up where it left off.  It uses an efficient streaming approach, so it won't consume excessive memory. 

This system runs indefinitely, providing a continuous stream of trading events. You’re essentially getting a live, always-on view of your strategy’s performance.




The `run` method kicks off this process, taking the symbol you want to trade as input and returning a generator that produces updates.

## Class LiveGlobalService

This service helps you connect to and run live trading scenarios within the backtest-kit framework. Think of it as a convenient way to access the core live trading engine, especially when you're building applications where different parts need to work together.

It provides a simple way to inject dependencies, making your code more organized and testable.

The key function, `run`, is how you actually kick off the live trading process for a specific trading symbol. It continuously produces results, handles potential issues, and keeps the trading running even if errors pop up. You’ll need to specify the symbol you want to trade and some context information, such as the strategy and exchange names.

## Class FrameSchemaService

The FrameSchemaService helps you keep track of the structures your backtesting strategies use. It's like a central place to define and manage the blueprints for your data frames. 

You can add new frame structures using `register` or update existing ones with `override`. When you need to use a specific frame, you simply request it by name using `get`, and the service will provide you with the defined schema. This service relies on a type-safe storage mechanism for accurate and reliable schema management.

## Class FrameGlobalService

This service, `FrameGlobalService`, handles the creation of timeframes used in backtesting. It works behind the scenes to manage connections and generate the date ranges needed for your trading simulations. Think of it as the engine that provides the historical data windows for your backtest. It relies on a `FrameConnectionService` to actually fetch the data and uses a `loggerService` for tracking what's happening. The core functionality is the `getTimeframe` method, which takes a symbol (like "BTCUSDT") and returns an array of dates representing the timeframe for that asset.

## Class FrameConnectionService

The FrameConnectionService acts as a central hub for managing your backtest frames. It intelligently routes requests to the right frame implementation based on your method context, simplifying how you interact with frames during backtesting. 

To improve performance, it remembers previously created frames, so you don't have to recreate them every time. This service handles the complexities of timeframe management, allowing you to define start and end dates and intervals for your backtests. 

It retrieves frames based on their names, and can also give you the timeframe boundaries for a particular trading symbol, which is useful for limiting your backtest to a specific date range. The service relies on other components like logger, schema and method context services for its operation. 

When in live mode, frames are not used, and the frameName will be empty.

## Class ExchangeSchemaService

The ExchangeSchemaService helps you keep track of information about different cryptocurrency exchanges in a structured and reliable way. It acts like a central repository where you store and manage exchange-specific details, ensuring your backtesting system knows how to interact with various exchanges.

Think of it as a place where you register exchanges – you give each exchange a unique name and associated data describing its features and how to use it. You can then easily look up this information later by its name.

If an exchange already exists in the system, you can update its details with just the information that has changed, rather than re-entering everything from scratch. This service uses a specialized system to ensure the data is handled safely and consistently.

## Class ExchangeGlobalService

This service acts as a central hub for interacting with an exchange, while also keeping track of important details about the current trading scenario – like the symbol being traded, the precise time, and whether it’s a backtest. It combines the exchange connection with the current execution environment.

You'll find methods for retrieving historical candle data (past price information), and in backtest mode, it can even fetch future candles to simulate different scenarios. It can also calculate the average price over a specific period.

The service provides handy functions for formatting prices and quantities, taking into account the trading context. Essentially, it streamlines common exchange operations and ensures consistency in how information is handled within the backtesting or live trading process.

## Class ExchangeConnectionService

This service acts as a central hub for interacting with different cryptocurrency exchanges. It handles the complexity of communicating with each exchange, automatically choosing the right one based on the current context. Think of it as a translator, taking your requests and sending them to the correct exchange in the language it understands.

It keeps track of the exchange connections to make things faster; if you're repeatedly using the same exchange, it reuses the connection rather than creating a new one each time.

You can use it to retrieve historical price data (candles), get the next set of candles based on your backtesting timeline, find the average price, and even correctly format prices and quantities to match each exchange's specific rules. The service handles the nitty-gritty details so you can focus on your trading logic.

## Class ClientFrame

The ClientFrame is the engine that creates the timeline of data your backtesting strategy will use. It’s responsible for generating arrays of timestamps, defining the start and end points of your backtest period. To make things efficient, it remembers previous timeframe calculations and reuses them, avoiding unnecessary work. You can control how frequently the data points are generated, choosing intervals from one minute to three days. It's designed to work closely with the core backtesting logic, providing the sequence of dates it needs to run simulations. 

You set up the timeframe using parameters, and then call `getTimeframe` to get the date array for a specific trading symbol. This function cleverly caches the results so it doesn’t recalculate the same timeframe repeatedly.

## Class ClientExchange

This component handles interactions with an exchange, providing essential data for backtesting and trading simulations. It's designed to be lightweight and efficient, reusing functions wherever possible.

You can retrieve historical candle data, looking backward from a specific point in time. Conversely, it’s also able to fetch future candles, which is particularly useful during backtesting to simulate how a strategy would perform given future price action.

The component includes a convenient function to calculate the Volume Weighted Average Price (VWAP) using recent candle data.  If there's no volume data available, it falls back to a simple average of close prices. 

Finally, it can format both quantity and price values to match the exchange's required precision, ensuring orders are correctly represented.

## Class BacktestUtils

This class offers helpful tools for running backtests within the framework. Think of it as a convenient way to kick off a backtest and get results, especially when you want to keep track of what's happening. It streamlines the process of using the underlying `backtestGlobalService` by wrapping it in a simpler function. You access this functionality through the `run` property, which takes the symbol you want to backtest and some context details (like the strategy and exchange names) to help organize your tests. The `run` method returns a stream of results, allowing you to analyze the performance of your trading strategy over time.

## Class BacktestLogicPublicService

The BacktestLogicPublicService helps you run backtests in a smooth, organized way. It takes care of automatically passing along important information like the strategy name, exchange, and frame – so you don’t have to manually include it in every function call.

Think of it as a convenient layer on top of the private backtest logic, simplifying the process. 

The `run` method is your main tool for kicking off a backtest; it takes a symbol as input and returns a stream of results.  The results are delivered as a generator, providing you with closed signals as the backtest progresses.

## Class BacktestLogicPrivateService

This service handles the complex process of running backtests, especially when dealing with a lot of data. It works by first getting a list of timeframes and then stepping through them one by one. When a trading signal appears (like a buy or sell indication), it retrieves the necessary historical data (candles) and then executes your trading strategy using the `backtest()` function. 

The service smartly skips timeframes while a position is open to efficiently move forward. Importantly, it delivers results as a stream of data – instead of storing everything in memory at once, it provides closed signals one at a time. This is great for large backtests that might otherwise overwhelm your computer's memory. You can also stop the backtest early by interrupting the stream, which is very useful for debugging or testing. 

It relies on several other services for things like logging, managing global strategy settings, connecting to the exchange, and handling timeframes. The `run` method is the primary way to initiate a backtest; it takes the trading symbol as input and returns a generator that produces the results.

## Class BacktestGlobalService

This service acts as a central point for running backtests within the framework. Think of it as a convenient way to access backtesting tools, especially when you’re building applications that need to inject dependencies. 

It bundles together a logger and the core backtesting logic, making it easier to manage and reuse. The `run` method is the primary way to start a backtest, allowing you to specify the trading symbol and details about the environment in which the strategy should be tested. This lets you examine how your strategy performs under different conditions.


# backtest-kit interfaces

## Interface IStrategyTickResultOpened

This interface represents the result you get when a new trading signal is created within the backtest-kit framework. It signals that a signal has just been generated, after the system has validated and saved it. The `action` property will always be "opened," confirming this new signal creation event.  The `signal` property contains the actual data of the created signal, giving you access to the details of the newly generated trading opportunity.

## Interface IStrategyTickResultIdle

This interface, `IStrategyTickResultIdle`, represents what happens in your trading strategy when there’s no active signal – essentially, it's an idle state. It tells you that the strategy isn't currently taking any action because there's no signal to act upon.  The `action` property is specifically set to "idle" to clearly indicate this state, and the `signal` property will be `null` because no signal is present. Think of it as the strategy pausing, waiting for a new opportunity.

## Interface IStrategyTickResultClosed

This interface represents the result you get when a trading signal is closed during a backtest. It provides all the crucial information about that closure, including the signal itself, the current market price at the time of closing, and the reason for the closure. You'll find the exact timestamp of the closing event and a breakdown of the profit and loss (PNL) associated with that trade. Essentially, it's a final snapshot of a completed trading action within your backtest.

## Interface IStrategyTickResultActive

This interface, `IStrategyTickResultActive`, represents a situation where your trading strategy is actively monitoring a signal. Think of it as your strategy being "in the zone," watching for a specific price movement or condition to be met. 

It tells you that a signal is currently being tracked, and your strategy is waiting for either a Take Profit (TP) or Stop Loss (SL) trigger, or potentially a time limit to expire. The `action` property simply confirms this "active" status. 

You're given the `signal` itself - the details of the signal being watched - and the `currentPrice` to assess the market conditions. This result type is crucial for understanding what your strategy is doing between trade entries and exits.


## Interface IStrategySchema

The `IStrategySchema` describes how a trading strategy works within the backtest-kit framework. Think of it as a blueprint – it tells the system what your strategy does and how it operates. 

It has a few key parts:

*   `strategyName`: A unique name you give to your strategy so the system knows which one you're using.
*   `interval`: This specifies how often your strategy generates trading signals, like every minute, hour, or day.
*   `getSignal`: This is the core logic of your strategy. It's a function that takes a symbol (like "BTCUSDT") and returns a trading signal – basically, a suggestion to buy, sell, or hold.
*   `callbacks`: This optional section lets you hook into specific events in the backtest process, like when a new data point arrives.

## Interface IStrategyPnL

This interface, `IStrategyPnL`, holds the results of a trading strategy's profit and loss. It gives you a clear picture of how your strategy performed. 

You’ll find the `pnlPercentage` property here, representing the overall percentage gain or loss of the strategy. It also includes the `priceOpen` and `priceClose` values, which show the opening and closing prices used in the profit and loss calculation. Keep in mind that these prices have already been adjusted to account for fees (0.1%) and slippage (0.1%), giving you a more realistic view of your strategy’s performance.

## Interface IStrategyCallbacks

These callbacks let you react to key moments in your trading strategy's execution. You can use `onOpen` to perform actions when a new trading signal is generated and validated—perhaps to log the event or prepare for the trade. `onClose` is triggered when a signal is finalized and closed, providing the closing price so you can record performance or analyze results. Both callbacks tell you whether the event is part of a backtest, the symbol being traded, and the associated signal data.

## Interface IStrategy

The `IStrategy` interface outlines the fundamental actions a trading strategy needs to perform within the backtest-kit framework. 

At its core, a strategy must provide a `tick` method, which handles individual market updates and incorporates VWAP tracking. Think of this as the strategy's response to each incoming piece of market data. 

Additionally, a strategy can provide a `backtest` method. This allows you to quickly simulate how your strategy would have performed using historical price data, letting you evaluate its potential without risking real capital. The `backtest` method takes an array of historical candles as input.

## Interface ISignalRow

The `ISignalRow` interface represents a complete trading signal, the kind you're actually working with after it's been checked for errors and is ready to be used. Every signal will have a unique `id`, which is automatically created when the signal is processed. Think of it as the signal's official name within the backtest-kit system, helping you keep track of it throughout your backtesting process.

## Interface ISignalDto

This interface, `ISignalDto`, represents the data you receive when requesting a trading signal. Think of it as a standardized package containing all the essential information for a single trade idea. It includes details like whether the signal suggests buying ("long") or selling ("short"), a brief explanation or note about the signal, entry price, target take profit price, stop loss price, an estimate of how long the signal might last, and a timestamp indicating when the signal was generated. The system automatically assigns a unique identifier (id) to each signal when it's created.

## Interface ISignalData

The `ISignalData` interface holds the information needed to store a signal within your backtesting system. Think of it as a container for a single signal's data. A key feature is the inclusion of `signalRow`, which holds all the details about that specific signal. This design allows for safer, atomic updates when dealing with the persistence layer.

## Interface IRunConfig

The `IRunConfig` interface defines the basic settings needed to run a backtest. It specifies which trading pair, identified by its `symbol`, you want to analyze. You also set the `interval`, which represents how frequently data points are captured, measured in milliseconds. Think of it as determining the granularity of your historical data.

## Interface IReduceResult

`IReduceResult` represents the outcome of a reduction process, often used when analyzing trading data. It bundles together key information about the result of that analysis. You’ll find the `symbol` which identifies the trading pair involved, the `accumulator` which holds the final calculated value—this could be anything from profit to a complex metric—and a `totalTicks` count that tells you how much data was processed. Think of it as a container neatly holding the results of a calculation performed across a series of market events.

## Interface IPersistBase

This interface defines the basic operations for managing data persistence, like saving, reading, and checking for the existence of information. Think of it as a core foundation for interacting with a storage system. `waitForInit` is a crucial first step, ensuring that the storage is ready before you attempt any operations. `readValue` allows you to retrieve a specific piece of data, identified by a unique ID.  `hasValue` simply checks if a piece of data exists for a given ID, returning true or false. Finally, `writeValue` lets you save or update data, associating it with a particular ID.


## Interface IMethodContext

The `IMethodContext` interface helps your trading strategies know which specific data and components to use. Think of it as a little package of information that's passed along to different parts of your backtesting system. 

It tells your strategies which exchange, strategy, and frame schemas are relevant for the current operation. The `exchangeName` and `strategyName` properties specify the names of the schema to pull data from, while `frameName` indicates the frame schema being used—it’s empty when running in live trading mode. This context ensures your strategies are using the correct information for accurate backtesting.


## Interface ILogger

The `ILogger` interface defines how different parts of the backtest-kit framework communicate about what's happening. Think of it as a central place to record important events and details.

It provides methods for logging messages at various levels of importance – general messages (`log`), detailed debugging information (`debug`), and informational updates (`info`). These logs help you understand what’s going on inside the system, track down errors, and generally monitor its behavior. You’re able to record things like agent actions, policy checks, or successful data saves.

## Interface IFrameSchema

This `IFrameSchema` describes a predefined time window used for backtesting trading strategies. Think of it as a blueprint for how your backtest will slice up historical data. 

Each schema has a unique `frameName` to easily identify it, and specifies the `interval` at which timestamps will be generated (like daily, hourly, or weekly). You also define the `startDate` and `endDate` to mark the backtest period itself, ensuring it covers the data you want to analyze.  Finally, you can optionally include `callbacks` to perform custom actions at different stages of the frame's lifecycle.

## Interface IFrameParams

The `IFrameParams` object defines the information needed to set up a core component within the backtest-kit framework. Think of it as the initial configuration details. It builds upon the `IFrameSchema` which provides a base structure, and crucially, includes a `logger` property. This logger allows the framework to record internal events and provide helpful debugging information as your backtesting runs. It’s an essential part of setting up how the framework operates.

## Interface IFrameCallbacks

This section describes the `IFrameCallbacks` interface, which lets you hook into important events during the creation of timeframes for backtesting. Specifically, you can use it to react when a new set of timeframes is generated. The `onTimeframe` function within this interface gets triggered at that moment, giving you the generated timeframe data (as dates), the start and end dates of the timeframe, and the interval used. Think of it as a way to observe and potentially verify the timeframe creation process as it happens.

## Interface IFrame

The `IFrame` interface is a core part of how backtest-kit manages time. It's mainly used behind the scenes to make sure your backtesting runs smoothly over a specific timeframe.

The main function you'll encounter is `getTimeframe`. This function takes a symbol (like "BTCUSDT") and returns an array of dates – these are the specific points in time your backtest will analyze. Think of it as generating the schedule for your backtesting. The dates will be evenly spaced, based on the interval you've set up for your backtest.

## Interface IExecutionContext

The `IExecutionContext` interface provides essential information about the current trading environment. Think of it as a container holding key details that are passed around during strategy execution and exchange interactions. It lets your strategies know things like which trading pair they're working with ("BTCUSDT", for example), what the current timestamp is, and whether they're running a backtest or a live trade. This context is automatically provided, so you don’t need to manage it yourself – it’s just there to inform your trading logic.

## Interface IExchangeSchema

The `IExchangeSchema` defines how backtest-kit interacts with a specific cryptocurrency exchange. Think of it as a blueprint for connecting to and retrieving data from an exchange. 

It tells backtest-kit where to get historical candle data (price charts) by providing a function, `getCandles`, that fetches this data for a given trading symbol, time interval, starting date, and number of candles needed. 

This schema also handles how trade quantities and prices are formatted for that exchange.

Finally, you can provide optional callback functions through the `callbacks` property to customize certain exchange-specific behaviors.


## Interface IExchangeParams

This interface defines the information you're expected to provide when setting up a connection to an exchange within the backtest-kit framework. Think of it as the configuration details needed to interact with a specific trading platform. 

It requires you to provide a logger object for tracking and debugging – this helps you understand what's happening during your backtesting. 

You also need to pass in the execution context, which contains essential details about the environment your trading strategy will be running in. This context will be used during the backtesting process.

## Interface IExchangeCallbacks

The `IExchangeCallbacks` interface lets you hook into events happening when your backtest kit connects to an exchange. Specifically, you can define a function to be called whenever new candlestick data arrives. This function receives details about the symbol, the time interval of the candles, the starting date and time for the data, the number of candles requested, and an array containing the actual candlestick data. It’s a way to react to incoming data as it’s being processed by the backtest system.


## Interface IExchange

The `IExchange` interface defines how your backtesting environment interacts with a simulated exchange. It lets you retrieve historical and future price data (candles) for a specific trading symbol and timeframe. 

You can request batches of candles going back in time using `getCandles` and look ahead to future candles (essential for backtesting strategies) with `getNextCandles`. 

To ensure orders are placed correctly, `formatQuantity` and `formatPrice` help you convert numerical quantities and prices into the specific format required by the exchange. 

Finally, `getAveragePrice` provides a quick way to calculate the VWAP (Volume Weighted Average Price) based on recent trading activity, which can be useful for certain trading strategies.

## Interface IEntity

This interface, IEntity, serves as the foundation for all data objects that are saved and retrieved from storage within the backtest-kit framework. Think of it as a common starting point for things like trades, orders, or account snapshots. Any class that needs to be persisted – meaning it needs to be saved and loaded – should implement this interface. It ensures a consistent structure for all persisted data, making it easier to manage and work with different types of entities.

## Interface ICandleData

This interface represents a single candlestick, a common way to visualize price movements over a specific time period. Each candlestick holds information about the open, high, low, and close prices, as well as the volume traded during that time. The `timestamp` property tells you exactly when this price data applies. You'll use these candle data points as the foundation for things like calculating VWAP or running backtests of your trading strategies. Essentially, it's the basic building block for historical price data in the backtest-kit framework.

## Interface IBacktestResult

The `IBacktestResult` interface holds the output from a backtesting run. It contains two key pieces of information: the `symbol` being traded, which is simply the trading pair like "BTCUSDT," and an array called `results`. This `results` array is where all the detailed information about each trade execution during the backtest is stored, providing a record of every trade's outcome. Essentially, this interface bundles everything you need to analyze how a strategy performed on historical data.
