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


# backtest-kit functions

## Function setLogger

This function lets you plug in your own logging system for backtest-kit. It's a simple way to see what's happening under the hood of your trading strategies and backtests. You provide a logger object that adheres to the `ILogger` interface, and the framework will send all its log messages to your logger. The framework will also automatically include useful information like the strategy name, exchange, and trading symbol in each log message, making it easier to understand the context.

## Function listStrategies

This function provides a simple way to see all the trading strategies currently set up within your backtest-kit environment. Think of it as a directory listing for your strategies – it gives you a list of all the strategy definitions you’re using. This is particularly helpful when you're trying to understand your system’s configuration, generate documentation, or create tools that can automatically manage or display available strategies. The result is a list of strategy schemas, allowing you to easily inspect their details.

## Function listFrames

This function helps you discover all the different data structures, or "frames," that your backtest kit is using. It gives you a list of these frames, telling you what data they contain and how they're organized. Think of it as a way to see the blueprint of your backtest’s data – great for understanding what’s happening under the hood or creating tools that adapt to different data layouts. You can use this to inspect your setup, generate documentation, or build user interfaces that dynamically adjust based on the frames you’ve registered.

## Function listExchanges

This function provides a straightforward way to see all the exchanges your backtest-kit setup is using. It returns a list of exchange details, letting you know exactly which exchanges are available for trading simulations. Think of it as a quick inventory of your supported exchanges, great for making sure everything's configured correctly or for dynamically displaying exchange options in your interface. It's a simple way to get a clear picture of your trading environment.


## Function listenSignalOnce

This function lets you set up a temporary listener for strategy signals. You provide a filter that defines which signals you’re interested in, and then a function to execute when a matching signal arrives. The key thing is that it automatically stops listening after the function runs just once, so you don't have to worry about cleaning up the subscription manually. This is really handy when you need to react to a particular signal condition just one time and then move on. 

It takes two arguments: a filter function that checks each signal and a callback function that gets executed when the filter matches. The filter function decides which signals are relevant, and the callback handles those specific signals.

## Function listenSignalLiveOnce

This function lets you temporarily "listen in" on the live trading signals being generated by your backtest. It’s perfect for quickly grabbing a single piece of information or performing a one-off action based on a specific event. You provide a filter – a rule that decides which signals you’re interested in – and a callback function that gets executed only once when a matching signal arrives. After that one execution, the function automatically stops listening, so you don't have to worry about manually unsubscribing. It only works with signals produced during a `Live.run()` execution.

You give it two things: a filter that determines which signals to consider, and a function to run when a matching signal appears. The callback runs just once and then the subscription is automatically stopped.


## Function listenSignalLive

This function lets you set up a listener that gets notified whenever a live trading strategy generates a signal. Think of it as plugging into the live execution of your backtest.

When you use `listenSignalLive`, you provide a function that will be called with each signal generated.

Importantly, this listener only works with signals coming from a `Live.run()` execution. The signals you receive will be processed one at a time, ensuring they arrive in the order they were created. It returns an unsubscribe function which can be used to stop the listening.

## Function listenSignalBacktestOnce

This function lets you temporarily listen for specific signals generated during a backtest. Think of it as setting up a temporary observer that only cares about certain events happening. You provide a filter – a rule that decides which signals you’re interested in – and a function to execute when a matching signal arrives.  Once that one event is processed, the listener automatically shuts itself down, so you don't need to worry about manually unsubscribing. This is really useful for quickly reacting to a particular market condition or verifying a specific outcome during a backtest. The function returns another function that you can use to stop the listener before the event happens.


## Function listenSignalBacktest

This function lets you tap into the backtest process and get notified whenever a signal is generated. Think of it as subscribing to updates from your trading strategy as it runs through historical data. 

It works by providing a function that will be called with each signal event that occurs during a `Backtest.run()` execution. 

These signals are delivered one at a time, in the order they happen, so you can be sure you're processing them sequentially. The function you provide will be executed with an object containing information about the signal. When you're done listening for these signals, the function returns another function that you can call to unsubscribe.


## Function listenSignal

This function lets you register a listener that gets notified whenever your trading strategy produces a signal. Think of it as setting up an alert system for your backtest. 

Whenever your strategy changes state—like going idle, opening a position, becoming active, or closing a position—your provided function will be called.

Importantly, the signals are processed one at a time, even if your callback function involves some asynchronous operations. This ensures that your signals are handled in the order they occur and prevents any unexpected issues caused by running things at the same time. To unsubscribe, the function returns a function that you can call to stop receiving these signals.

## Function listenProgress

This function lets you keep an eye on how your backtest is progressing, especially when it's performing background tasks. It's like setting up a notification system that will tell you about updates as your backtest runs. The information arrives as progress events, and crucially, even if your notification logic takes some time to process each update, the events are handled one at a time in the order they arrive. This helps ensure things stay organized and prevents any unexpected issues caused by trying to handle everything at once. You provide a function that will be called whenever a progress update becomes available.

## Function listenError

This function lets you keep an eye on any errors that pop up during background tasks within your backtesting or live trading environment. Think of it as setting up a safety net to catch any unexpected problems happening behind the scenes. Whenever an error occurs within a Live.background() or Backtest.background() operation, this function will trigger your provided callback. Importantly, it handles these errors one at a time, ensuring that your error handling logic isn’t overwhelmed by multiple issues happening simultaneously. You provide a function that will be called when an error is detected, and this function returns another function that allows you to unsubscribe from error notifications when you no longer need them.

## Function listenDoneOnce

This function lets you be notified when a background task, like one started with `Live.background()` or `Backtest.background()`, finishes, but only once. You provide a filter that determines which completion events you’re interested in, and a function to run when a matching event occurs. After the callback runs the first time, the subscription automatically stops, so you don’t have to worry about manually unsubscribing.

Essentially, it's a one-time listener for background task completion events.

Here's a breakdown of how to use it:

*   **`filterFn`**: This is a test. It examines each completion event to see if it matches your criteria. Only events that pass this test trigger your callback.
*   **`fn`**: This is the action you want to perform when a matching completion event is detected. It receives the details of that event.

## Function listenDone

This function lets you be notified when a background task finishes, either from a live trading environment or a backtest. Think of it as setting up a listener that gets triggered when a long-running process in the background is done. The important thing is that even if your notification code takes some time to run (like if it’s doing some calculations), the notifications will be handled one at a time, ensuring they happen in the order they were received. You provide a function that will be called when the background task completes, and this function returns another function you can call to unsubscribe from these completion events.

## Function getMode

This function tells you whether the trading framework is currently running a backtest or is in live trading mode. It's a simple way to check the context of your code and adjust behavior accordingly, for example, to handle data differently depending on whether you're analyzing historical data or executing real trades. The function returns a promise that resolves to either "backtest" or "live," making it easy to integrate into your asynchronous workflows.

## Function getDate

The `getDate` function lets you access the current date within your trading strategies. When running a backtest, it provides the date associated with the specific timeframe you're analyzing. If you're running the code live, it gives you the actual, real-time date. This is useful for time-sensitive logic in your strategies.

## Function getCandles

This function lets you retrieve historical price data, or "candles," for a specific trading pair. Think of it as grabbing snapshots of the market's activity over time.

You tell it which trading pair you're interested in (like BTCUSDT), how frequently you want the snapshots (every minute, every hour, etc.), and how many snapshots you need.

The function then fetches that data from the exchange you're connected to and provides you with an array of candle data points. It's a simple way to access past market behavior for analysis or backtesting.


## Function getAveragePrice

This function helps you determine the Volume Weighted Average Price, or VWAP, for a specific trading symbol like BTCUSDT. It looks at the last five minutes of trading data, specifically the high, low, and closing prices, along with the volume traded. The calculation involves finding the typical price of each candle and then weighting it by the volume. If there's no volume data available, it falls back to calculating a simple average of the closing prices. You just need to give it the symbol you're interested in, and it returns a promise that resolves to the calculated VWAP value.

## Function formatQuantity

This function helps you ensure your trade quantities are formatted correctly for the specific exchange you're using. It takes a trading symbol, like "BTCUSDT", and a raw quantity value as input. The function then uses the exchange's rules to properly format the quantity, making sure it includes the right number of decimal places. This is essential for submitting orders that the exchange will accept. Essentially, it handles the exchange-specific quirks of quantity formatting for you.

## Function formatPrice

This function helps you display prices correctly for different trading pairs. It takes a symbol like "BTCUSDT" and a raw price value as input. Then, it uses the specific formatting rules for that exchange to ensure the price is shown with the right number of decimal places, making it look accurate and professional. Essentially, it handles the complexity of price formatting for you so you don't have to.

## Function addStrategy

This function lets you add a trading strategy to the backtest-kit framework. Think of it as registering your trading logic so the system knows how to run it. When you add a strategy, the framework will automatically check it to make sure it's set up correctly – things like verifying the price data, stop-loss/take-profit rules, and timestamps are all validated.  It also helps prevent your strategy from sending too many signals too quickly and makes sure your strategy’s data survives if there’s a system crash when you’re running it live. You provide a configuration object, known as `strategySchema`, which defines your strategy's behavior.

## Function addFrame

This function lets you tell backtest-kit how to create the timeframes it will use for simulating trades. Think of it as defining the scope and granularity of your backtest – setting the start and end dates, and deciding how frequently you want data points (like daily, hourly, or minute-by-minute).  You provide a configuration object that outlines these details, including how your backtest should react to events related to timeframe generation. Essentially, it’s the foundation for building your backtest's timeline.

## Function addExchange

This function lets you tell backtest-kit about a data source for a specific exchange you want to trade. Think of it as registering where the framework should pull historical price data from. You provide a configuration object that describes the exchange, and the framework will then use that information to fetch candles, format prices, and even calculate things like VWAP based on recent trading activity. Essentially, you're teaching the framework how to work with data from a particular exchange.

# backtest-kit classes

## Class StrategyValidationService

The StrategyValidationService helps ensure your trading strategies are correctly defined before you start backtesting. It acts as a central place to register and validate strategy schemas, preventing errors down the line. 

You can add strategy definitions to the service using `addStrategy`, essentially telling it what a valid strategy for your system looks like. The `validate` method then checks a given strategy's code against that definition. 

If you need to see what strategies you've registered, `list` will give you a list of all the defined strategy schemas. This service promotes consistency and reduces the risk of unexpected behavior in your backtesting process.

## Class StrategySchemaService

This service helps keep track of the blueprints, or schemas, for your trading strategies. It uses a special system to ensure everything is typed correctly and avoid errors.

You can add new strategy blueprints using `addStrategy()`, and retrieve them later by their names using `get()`.  If you need to update a strategy's blueprint, you can use `override()` to make partial changes. 

Before a new strategy blueprint is added, it’s checked using `validateShallow()` to make sure all the essential parts are present and in the expected format. The `_registry` property stores the actual blueprints, and `loggerService` is used for logging any issues.

## Class StrategyGlobalService

The StrategyGlobalService helps you interact with your trading strategies in a consistent way, automatically providing necessary information like the trading symbol, timestamp, and whether you're in backtest mode. It’s a central point for managing strategies, used behind the scenes by other parts of the backtesting and live trading systems.

You can use it to check how a strategy is performing at a specific point in time using the `tick` function.  Want to quickly run a backtest over a set of historical candle data? The `backtest` function is your go-to.

Need to pause a strategy’s signal generation? Use `stop`.  If you're looking to refresh a strategy and force it to reconnect, `clear` will remove it from the system’s memory. This service manages the underlying connections and caches, simplifying how you work with your trading strategies.

## Class StrategyConnectionService

The StrategyConnectionService acts as a central hub for managing and executing trading strategies. It intelligently routes your strategy requests to the correct implementation, ensuring the right code handles the task. It keeps track of which strategies are loaded and reuses them when possible, which makes things run faster. 

Think of it as a dispatcher that finds the right strategy based on the context. Before it does anything, it makes sure the strategy is ready.

Here's a quick breakdown of what you can do:

*   **`tick()`:** Processes live market data to generate trading signals.
*   **`backtest()`:** Runs simulations using historical data to see how a strategy would have performed.
*   **`stop()`:**  Pauses a specific strategy from making further decisions.
*   **`clear()`:** Forces the system to reload a strategy, useful for resetting it or freeing up resources.

The service relies on other components like the logger, execution context, and schema services to function correctly.

## Class PersistSignalUtils

This class helps manage how trading signals are saved and loaded, particularly for strategies that need to remember their state. Think of it as a reliable way to ensure your strategies don't lose information when they're restarted or experience unexpected interruptions.

It handles the storage of signal data, allowing each strategy to have its own dedicated space. You can even customize how this data is stored by plugging in your own storage adapters. 

The `readSignalData` function retrieves previously saved signal data, useful when a strategy needs to pick up where it left off. Conversely, `writeSignalData` securely saves the current signal state, using techniques to prevent data corruption in case of crashes. It is crucial for strategies relying on persistent state.

Finally, the `usePersistSignalAdapter` method allows you to extend its functionality by registering your own custom storage implementations.

## Class LoggerService

The `LoggerService` helps ensure consistent and informative logging across the backtest-kit framework. It acts as a central point for logging, automatically adding useful context like the strategy, exchange, and frame names, along with information about the symbol, time, and whether it's a backtest.

You can customize the logging by providing your own logger through the `setLogger` function. If you don't provide one, it will default to a simple "no-op" logger that doesn't actually log anything.

The service also provides different logging levels – `log`, `debug`, `info`, and `warn` – each automatically including the context. These methods are asynchronous, returning a Promise after the logging operation.  Behind the scenes, it uses `methodContextService` and `executionContextService` to manage the context information.

## Class LiveUtils

LiveUtils provides helpful tools for live trading, streamlining the process and offering recovery features. It’s designed to be easily accessible throughout your backtest-kit projects.

The `run` function is the primary way to execute live trading; it’s an infinite generator that automatically handles crashes and restores the trading state from saved data. You can specify the symbol and context (strategy and exchange names) when you start it.

If you simply need to run live trading for actions like persisting data or triggering callbacks without needing to see the results, the `background` function provides a way to do that. This runs trading indefinitely in the background until the process is stopped.

You can also gather statistics about a strategy’s live trading activity with `getData` or generate a comprehensive report using `getReport`. Finally, `dump` lets you save those reports directly to disk for later review.

## Class LiveMarkdownService

The LiveMarkdownService helps you automatically create detailed reports about your live trading strategies. It quietly listens to what’s happening during your trades – from the moments of inactivity to when trades are opened, active, and ultimately closed. 

It keeps track of all these events, organized by strategy, and then transforms them into nicely formatted markdown tables that provide a clear picture of performance. You’ll find essential trading statistics like win rate and average profit/loss included in these reports. 

These reports are automatically saved to your logs folder, making it easy to review and analyze your strategy's behavior. The service handles the initial setup automatically, and you can also clear the data if needed, either for a specific strategy or all of them.

## Class LiveLogicPublicService

This service simplifies live trading by handling the background details for you. It builds upon a private service and automatically manages essential information like the trading strategy name and the exchange being used, so you don’t have to pass it around explicitly. 

Think of it as a continuous stream of trading events – opened and closed signals – that keeps running indefinitely.  If the process unexpectedly stops, it's designed to recover and pick up where it left off, thanks to saved state. It keeps track of the current time to ensure everything happens in the right order.

To start live trading, you just provide the trading symbol and it takes care of the rest, automatically sending the necessary context to all the trading functions.

## Class LiveLogicPrivateService

The LiveLogicPrivateService handles the ongoing process of live trading, acting as a continuous engine for your strategies. It constantly monitors the market, creating a real-time record of trading activity.

Think of it as an infinite loop that checks for signals and provides a stream of results – only showing you when trades are opened or closed. If something goes wrong and the process crashes, it automatically recovers and picks up where it left off.

The service uses an asynchronous generator to efficiently deliver these trading updates, making it memory-friendly and well-suited for long-running operations. You provide the symbol you want to trade, and it continuously provides a stream of trading events.

## Class LiveGlobalService

This service acts as a central hub for accessing live trading features within the backtest-kit framework. Think of it as a convenient way to inject dependencies and interact with the core live trading logic. 

It provides access to services that handle logging, live trading operations, and validation of strategies and exchanges. 

The most important function, `run`, is the powerhouse for live trading.  It starts and manages the live execution of a trading strategy for a specific symbol, continually producing results and automatically recovering from any crashes to keep the process running. You provide the symbol to trade and information about the strategy and exchange being used.


## Class FrameValidationService

The FrameValidationService helps you ensure your trading frames are set up correctly within backtest-kit. Think of it as a quality control system for your data structures.

You register your frame schemas – essentially blueprints for how your data should be organized – using the `addFrame` method. This lets the service know what to expect.

The `validate` function then checks if a given frame actually exists and conforms to the schema you’ve registered, helping you catch errors early.

Need to see what frames you’ve already registered? The `list` function returns all of them in a handy list. 

The `loggerService` property allows you to integrate with your existing logging system.  The `_frameMap` property is an internal storage for registered frame schemas.

## Class FrameSchemaService

The FrameSchemaService helps you keep track of the structures of your trading data, ensuring everything is consistent and well-defined. It acts like a central library where you store and manage these data blueprints.

You can add new data blueprints using `register`, essentially registering a new type of data your system will use. If you need to make small adjustments to an existing blueprint, `override` lets you update just the parts that need changing.  And when you need to use a specific data structure, `get` lets you retrieve it by its name. The service uses a specialized storage system to ensure the blueprints are type-safe, helping prevent errors. It also performs checks to ensure new blueprints have the necessary components before they are added.

## Class FrameGlobalService

This service helps manage and generate the timeframes needed to run a backtest. Think of it as the engine that provides the historical data points – the dates and times – your trading strategy will be tested against. 

It works closely with a connection to your data source (the `FrameConnectionService`) to fetch those timeframes.  The `getTimeframe` method is the key function, allowing you to request the array of dates for a specific trading symbol. This array then becomes the backbone of your backtesting loop, dictating the sequence of events your strategy will experience. It's the internal workhorse for generating those vital historical timelines.

## Class FrameConnectionService

The FrameConnectionService helps you work with different trading frames, like historical data sets, by automatically directing requests to the correct frame implementation. It figures out which frame to use based on the current method context, so you don't have to manually specify it.

To improve performance, it keeps a record of the frames it’s using, so it doesn't have to recreate them every time. This service is essential when performing backtests, as it allows you to define the start and end dates for your historical data.

You can easily retrieve the timeframe (start and end dates) for a specific symbol to restrict your backtesting period.  The service also handles situations where you're not using a frame at all, like when running in live mode. 

It utilizes services like the logger, frame schema, and method context to function effectively.  You can access a memoized ClientFrame using the `getFrame` method, and it provides the `getTimeframe` method to fetch backtest boundaries.

## Class ExchangeValidationService

The ExchangeValidationService helps ensure your trading strategies are set up correctly by validating the configuration for different exchanges. Think of it as a quality check for your exchange setups. 

You can add exchange schemas to the service to define how data from each exchange should look.  The `addExchange` function lets you register these schemas, associating a name with its structure.

The `validate` function is used to actually check if an exchange's data conforms to the registered schema, helping you catch errors early.

If you want to see what exchanges you’ve already registered and their associated configurations, the `list` function provides a handy way to get a list of all the registered exchange schemas.

## Class ExchangeSchemaService

This service helps you keep track of information about different cryptocurrency exchanges, ensuring your backtesting framework has the right details for each one. It uses a safe and organized way to store this exchange data, like a catalog.

You can add new exchange information using `addExchange()` (represented by the `register` property) and find existing exchanges by their name with `get()`. Before adding new exchange data, `validateShallow` checks that everything is in the correct format.  If you need to update an existing exchange's details, `override` lets you make partial changes without rewriting the whole entry. The service also has a built-in logger to help you track what's happening.

## Class ExchangeGlobalService

This service handles interactions with an exchange, making sure to pass along important information about the trading environment like the symbol being traded, the time, and whether it's a backtest or live run. It’s built on top of other services to manage these contextual details.

You're able to retrieve historical candle data using `getCandles`. For backtesting scenarios, `getNextCandles` lets you pull in future candle data.

`getAveragePrice` calculates the average price, while `formatPrice` and `formatQuantity` are helpful for preparing price and quantity values for display or other uses, always considering the context of the trade.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges. It intelligently routes your requests – like fetching historical price data or getting the current average price – to the correct exchange based on your configuration. 

To improve performance, it keeps a record of the exchange connections it’s already established, so it doesn't have to create new ones every time. This service handles the nuances of each exchange, like ensuring prices and quantities are formatted correctly to meet their specific rules. It uses the method context to determine which exchange to use, and provides logging for all actions.

You can retrieve cached exchange connections using `getExchange`, fetch historical price data with `getCandles` and `getNextCandles`, get the current average price with `getAveragePrice`, and correctly format prices and quantities using `formatPrice` and `formatQuantity`.

## Class ClientFrame

The ClientFrame is a key component that helps manage the timeline for your backtesting simulations. It's responsible for creating the series of timestamps that your trading strategies will operate against. 

Think of it as a time machine generator; it provides the historical data points for your backtest. It smartly avoids re-creating the same timelines repeatedly, storing results to improve performance. 

You can control how frequently these timestamps are generated, from one minute to three days, ensuring your backtest matches the granularity of your strategy. 

The ClientFrame also lets you add custom checks and record information as the timeline is created. It works closely with the BacktestLogicPrivateService to ensure the backtesting process runs smoothly across historical periods.


## Class ClientExchange

This class provides a way to interact with an exchange, specifically designed for backtesting. It lets you retrieve historical and future candle data, essential for recreating trading scenarios. You can fetch past candle data to analyze how a strategy would have performed, and look ahead to simulate signal durations.  It also has a handy function to calculate the VWAP, useful for understanding price trends. Finally, it helps you prepare quantities and prices into the correct format for the exchange. The design prioritizes efficient memory usage by employing prototype functions.

## Class BacktestUtils

BacktestUtils provides helpful tools for running and analyzing backtests within the trading framework. It’s like having a central hub for your backtesting needs. 

The `run` method lets you kick off a backtest for a specific symbol, automatically logging the process and providing you with a stream of results. If you just want to run a backtest without needing to see the results directly – perhaps just for logging or some other side effect – you can use the `background` method. 

Once your backtests are complete, you can use `getData` to gather statistical information about a specific strategy's performance and `getReport` to create a nicely formatted markdown report summarizing the results. Finally, `dump` allows you to save those reports directly to a file on your computer.

## Class BacktestMarkdownService

This service helps you create readable reports about your backtesting results. It listens for signals during a backtest and keeps track of how each strategy performed. 

You can think of it as a data collector and reporter – it gathers information about closed trades and turns that into nicely formatted markdown tables. These tables are then saved as `.md` files in your `logs/backtest/` directory, making it easy to review your strategies’ performance.

The service uses a memoized storage system, so each strategy gets its own separate storage area to avoid conflicts. It automatically initializes when you start using it, and it's designed to clear out old data when needed, either for a single strategy or for all strategies at once. You can retrieve overall statistics or generate full reports whenever you need them.

## Class BacktestLogicPublicService

The `BacktestLogicPublicService` helps you run backtests in a more streamlined way. It takes care of automatically passing along important information like the strategy name, exchange, and timeframe to all the functions it uses, so you don't have to manually provide it every time.

Think of it as a helper that simplifies the backtesting process. It uses an internal service for the core logic, but adds a layer of convenience to handle context management for you.

The main thing you'll use is the `run` method. This lets you specify the trading symbol you want to backtest, and it will generate a stream of results, with the necessary context already set up.


## Class BacktestLogicPrivateService

This service helps you run backtests for trading strategies in a memory-friendly way. It orchestrates the backtesting process, working with timeframes and signals to efficiently evaluate your strategy's performance.

Essentially, it gets the necessary time data, then walks through it, triggering calculations whenever a trading signal appears. When a signal opens, it retrieves the required historical data and runs the backtest logic.  It intelligently skips over time periods while a signal is active. 

The results are streamed to you as a sequence of completed signals, allowing you to process them one at a time without needing to store everything in memory all at once. You can even stop the backtest early if you need to. This service relies on other services like the frame service and exchange service to get the data it needs to perform the backtest.

## Class BacktestGlobalService

This service acts as a central point for running backtests within the backtest-kit framework. It simplifies how different parts of the system interact by providing easy access to core functionalities. 

Think of it as a helper that wraps around more complex backtesting logic, making it manageable and injectable into other components. 

It gives you tools to validate strategies, exchanges, and data frames, ensuring everything is set up correctly before you begin. The main function, `run`, lets you execute a backtest for a specific asset, taking into account the strategy, exchange, and data frame you're using – it returns results as you go.

# backtest-kit interfaces

## Interface TickEvent

This interface defines the structure of a tick event, bringing together all the relevant data you’ll need when analyzing backtest results. Whether it’s an idle period, a trade being opened, actively running, or being closed, this interface ensures you have consistent data to work with.

Each tick event will include a timestamp, indicating precisely when it occurred. You'll also find the action type: "idle", "opened", "active", or "closed", telling you what's happening.

For trades (opened, active, and closed events), you’re provided with details like the trading symbol, signal ID, position type, and a note about the signal. Numerical data like the current price, open price, take profit, and stop loss are also included where relevant. The `pnl` property gives you the percentage profit or loss for closed trades, while `closeReason` and `duration` give you more context regarding how and when a trade ended.

## Interface ProgressContract

This interface, `ProgressContract`, helps you monitor the progress of your backtesting runs. It's designed to be emitted during background execution, giving you updates on how far along the backtest is. 

You’ll see information like the exchange being used, the name of the trading strategy, and the trading symbol being tested. Crucially, it tells you the total number of historical data points being analyzed (`totalFrames`), how many have been processed so far (`processedFrames`), and the overall percentage completion – expressed as a number between 0.0 and 1.0. This lets you track the backtest's status and estimate its remaining duration.

## Interface LiveStatistics

This interface provides a detailed snapshot of your live trading performance, offering a range of statistical metrics to help you evaluate and refine your strategies. It tracks every event that occurs during trading, from idle periods to signal closures, and calculates key performance indicators. 

You're given a complete list of all trading events, along with the total count of events and closed signals. The interface provides figures for wins and losses, allowing you to calculate a win rate. You can also see the average profit or loss per trade, the cumulative profit or loss, and a measure of volatility (standard deviation). 

Further analysis includes the Sharpe Ratio, an annualized version of that ratio, a certainty ratio indicating the ratio of average winning trades to the absolute value of average losing trades, and an estimate of expected yearly returns. All numerical values are carefully managed; if a calculation is unreliable (resulting in a NaN or Infinity), the corresponding value will be null.

## Interface IStrategyTickResultOpened

This interface represents the result you receive when a trading strategy successfully creates a new signal. Think of it as confirmation that a signal has been generated and is ready to be acted upon. It includes key information about the signal itself, like the signal data (`signal`), the name of the strategy that created it (`strategyName`), and the exchange it relates to (`exchangeName`). You’ll also find the current price at the moment the signal was opened (`currentPrice`), which is helpful for understanding the context of the trade. The `action` property simply confirms that this result signifies a newly opened signal.

## Interface IStrategyTickResultIdle

This interface represents what happens in your trading strategy when it’s in an idle state – meaning there's no active trade signal. It provides information about the current conditions at that moment. You’ll see this result when your strategy isn't making any decisions to buy or sell.

It includes details like the name of the strategy and the exchange it's operating on, along with the current price being tracked. Essentially, it's a record of your strategy pausing and waiting for new opportunities. The `action` property confirms the state is "idle," and the `signal` is explicitly `null` to indicate the absence of a trading signal.

## Interface IStrategyTickResultClosed

This interface describes the result you get when a trading signal is closed, providing a complete picture of what happened. It includes the original signal details, the price at which the signal was closed, and the reason for the closure – whether it was due to a time limit expiring, hitting a take-profit target, or triggering a stop-loss. You’ll also find profit and loss information, including fees and slippage, as well as the names of the strategy and the exchange used. Essentially, it's a final report card for a closed signal, giving you all the necessary data for analysis and optimization.

## Interface IStrategyTickResultActive

This interface, `IStrategyTickResultActive`, represents a situation where your trading strategy is actively monitoring a signal. It means a trade is open and the strategy is waiting for a specific event to occur, such as a take-profit or stop-loss trigger, or a time limit expiring.

The `action` property is always set to "active" to clearly identify this state.  You'll find the `signal` that's currently being tracked, along with the `currentPrice` being used for monitoring – likely a VWAP price. The `strategyName` and `exchangeName` are included to help you keep track of which strategy and exchange are responsible for the active trade.

## Interface IStrategySchema

This schema defines the blueprint for your trading strategies within the backtest-kit framework. Think of it as a recipe - it tells the system how your strategy will generate buy and sell signals.

Each strategy needs a unique name to identify it. You can also add a note to explain your strategy's purpose or logic for future reference.

The `interval` property sets a minimum time between signal requests, helping to manage how frequently your strategy is evaluated. 

The core of the strategy is the `getSignal` function. This function takes a symbol (like "BTC-USD") and calculates whether to buy, sell, or hold it, returning a structured signal object if a signal exists.

Finally, you can provide optional lifecycle callbacks to run code when the strategy is started (`onOpen`) or stopped (`onClose`).

## Interface IStrategyPnL

This interface, `IStrategyPnL`, represents the profit and loss results from a trading strategy. It provides a clear picture of how much a trade gained or lost, taking into account realistic trading conditions. 

The `pnlPercentage` property tells you the overall profit or loss as a percentage, making it easy to compare the performance of different strategies. 

You'll also find `priceOpen` and `priceClose`, which show the entry and exit prices respectively, but importantly these prices have been adjusted to reflect the impact of transaction fees (0.1%) and slippage (0.1%). This gives you a more accurate view of the actual price received or paid for the trade.

## Interface IStrategyCallbacks

This interface lets you hook into key moments in your trading strategy's lifecycle. Think of it as a way to listen for what's happening – when a signal is first opened, when it's actively being tracked, when nothing is happening, and when a signal is closed. 

You can define functions to be executed on each tick, receiving the result of the tick. 

The `onOpen` function triggers when a new signal is validated and ready to go. `onActive` fires when the strategy is monitoring an active signal. `onIdle` is called when there are no active signals, indicating a period of inactivity. Finally, `onClose` lets you know when a signal has been closed, along with the closing price. This provides valuable opportunities to log data, adjust parameters, or perform other actions based on the strategy's state.

## Interface IStrategy

The `IStrategy` interface outlines the fundamental actions a trading strategy needs to perform within the backtest-kit framework. 

The `tick` method represents a single step in the strategy's execution, handling things like checking for trading signals and potential take profit or stop loss triggers. 

The `backtest` method allows for rapid testing of your strategy using historical price data, simulating how it would have performed in the past.

Finally, the `stop` method provides a way to pause the strategy's signal generation, useful for cleanly shutting down a live strategy while letting existing orders run their course.

## Interface ISignalRow

This interface, `ISignalRow`, represents a complete signal that's been processed and validated within the backtest-kit framework. Think of it as a standardized format for signals that are used throughout the system. Each signal gets a unique identifier, an `id`, automatically assigned to it, making it easy to track.  You'll also find details like which `exchangeName` the signal pertains to, the `strategyName` that generated it, and the exact `timestamp` it was created. Finally, it includes the `symbol`, which specifies the trading pair involved, like "BTCUSDT."

## Interface ISignalDto

This interface, ISignalDto, represents the data used to define a trading signal. It's what you're working with when creating signals for backtesting or live trading.

Think of it as a blueprint for a trading instruction: it tells the system whether to buy (long) or sell (short), the entry price, where to set take profit and stop loss orders, and an estimated holding time.

Each signal will have a unique ID – it's automatically generated if you don't provide one.

The `note` property is for adding a descriptive explanation of the reasoning behind the signal—helpful for understanding and reviewing your trading decisions.

Remember that your take profit price needs to be higher than the entry price for long positions and lower for short positions, and the stop loss should be the opposite.

## Interface ISignalData

The `ISignalData` interface represents the data associated with a trading signal, designed for storing information persistently. Think of it as a container holding the current state of a signal.  It includes a `signalRow` property which holds the actual signal details. Importantly, the signal can be null, indicating that no signal is currently active. This nullability is useful for situations where you need to update the signal information in a single, atomic operation.

## Interface IPersistBase

This interface defines the basic operations for saving and retrieving data, acting as a foundation for more specialized persistence methods.  It ensures that the storage area is properly set up before you start saving anything. You can use it to check if a particular piece of data already exists, read existing data, and, most importantly, write new data while guaranteeing the entire process happens reliably. It handles the details of writing files so you don’t have to worry about those low-level concerns.

## Interface IMethodContext

The `IMethodContext` interface helps your backtesting framework know which specific configurations to use. Think of it as a little package of information that gets passed around, telling the system which exchange, strategy, and frame definitions apply to the current operation. 

It contains three key pieces of information: the name of the exchange, the name of the strategy, and the name of the frame. The frame name is left blank when running in live trading mode. This context ensures that the correct components are loaded and used, making sure everything works together seamlessly.

## Interface ILogger

The `ILogger` interface provides a way for different parts of the backtest-kit framework to record what's happening. It offers different levels of logging – from general messages (`log`) to detailed debugging information (`debug`), informative updates (`info`), and warnings about potential issues (`warn`). This logging system helps track events, operational details, validation outcomes, and errors throughout the entire process, making it easier to understand, monitor, and troubleshoot your trading strategies. Essentially, it's a central place to keep track of what's going on under the hood.

## Interface IFrameSchema

The `IFrameSchema` describes a specific time period and frequency for generating data within your backtesting simulations. Think of it as defining a "view" into your historical data. 

Each schema has a unique name to identify it, and you can add a note to explain its purpose. The `interval` property sets how often data points are generated—for instance, every minute, hour, or day. 

You also specify the start and end dates for the backtest period that this schema represents. Finally, you can optionally provide lifecycle callbacks to react to the frame’s initialization or finalization. This allows you to customize the behavior around each data frame.

## Interface IFrameParams

The `IFramesParams` interface defines the information needed when creating a `ClientFrame`, essentially acting as a configuration object. It builds upon the `IFramesSchema` interface, adding a crucial component: a logger. This logger allows for detailed debugging and tracking of what’s happening inside the frame, providing valuable insights when troubleshooting or optimizing your trading strategies. Think of it as a way to peek under the hood and see exactly how the frame is operating. The logger property lets you specify which logging service you want the frame to use.

## Interface IFrameCallbacks

This interface lets you hook into events happening within the backtest-kit framework as it sets up the time periods it will be working with. Specifically, the `onTimeframe` property lets you define a function that's called once the framework has created the list of dates it’s using for backtesting.  You can use this function to check the dates are what you expect, to log the timeframe for debugging, or perform any other actions you need when those dates are initially generated. The function receives the timeframe array, the start and end dates of the backtest, and the interval used to create the timeframes.

## Interface IFrame

The `IFrames` interface is a crucial part of how backtest-kit handles time – think of it as the engine that produces the sequence of dates your trading strategy will be evaluated against. It's not something you'll typically interact with directly, as it operates behind the scenes within the backtesting process.

The core function, `getTimeframe`, is responsible for creating that date sequence. You provide a symbol (like "BTCUSDT"), and it returns a Promise that resolves to an array of timestamps, evenly spaced according to the timeframe you're using. These timestamps are the stepping stones through which your backtest will progress.

## Interface IExecutionContext

The `IExecutionContext` interface holds essential information needed during strategy execution and exchange interactions. Think of it as a package of runtime details that's automatically passed around to functions like those fetching historical data, processing ticks, or running backtests. It tells your strategy *what* trading pair it's dealing with (the `symbol`), *when* the current operation is happening (the `when` timestamp), and importantly, whether it’s a backtest or a live trade (the `backtest` flag). This shared context ensures that your code has the necessary information without needing to explicitly pass it around everywhere.

## Interface IExchangeSchema

This interface describes how backtest-kit connects to different trading venues, like exchanges or data providers. Think of it as a blueprint for telling the framework where to get historical price data and how to handle order quantities and prices according to each exchange's specific rules. 

You’ll use it when you register a new exchange within the framework, providing details like a unique identifier and any helpful notes for developers. The most important part is `getCandles`, which tells the framework how to retrieve candle data (open, high, low, close prices) for a given trading symbol and timeframe.  You’ll also define functions to correctly format order quantities and prices, ensuring they adhere to the exchange's precision requirements. Optionally, you can add callbacks to handle lifecycle events, such as when candle data is received.


## Interface IExchangeParams

The `IExchangeParams` interface defines the information needed to set up an exchange connection within the backtest-kit framework. Think of it as the blueprint for how the exchange interacts with the backtesting environment.

It requires a `logger` to provide helpful debugging messages as your tests run, allowing you to pinpoint any issues.  It also needs an `execution` context, which is responsible for tracking the testing environment details like the trading symbol, the point in time for the test, and whether it’s a backtest or not. These parameters allow the exchange to behave correctly and accurately within the simulated trading environment.

## Interface IExchangeCallbacks

This interface lets you register functions to be notified when the backtest-kit framework receives candle data from an exchange. You can provide an `onCandleData` callback that will be executed whenever new candle information becomes available.  The callback receives the symbol, the interval (like 1 minute or 1 day), a timestamp indicating when the data started, the number of candles requested, and an array of candle data objects.  Essentially, it’s your chance to react to and process incoming historical or real-time candlestick data.

## Interface IExchange

The `IExchange` interface is the core for interacting with a simulated or real cryptocurrency exchange within the backtest-kit framework. It allows you to retrieve historical and future candle data—essentially, the price action over time—for a specific trading pair.

You can use `getCandles` to look back in time and grab past price data, while `getNextCandles` helps predict future prices during backtesting. To ensure orders are placed correctly, `formatQuantity` and `formatPrice` handle the specifics of the exchange's precision for trade sizes and prices. Finally, `getAveragePrice` provides a way to calculate the VWAP (Volume Weighted Average Price), which is a commonly used indicator based on recent trading activity.

## Interface IEntity

This interface, IEntity, serves as the foundation for all objects that are saved and retrieved from storage within the backtest-kit framework. Think of it as a common blueprint; any object that needs to be persistently stored – like historical prices, orders, or account data – will implement this interface. It ensures a standardized structure for these persisted entities, making it easier to manage and work with them throughout the backtesting process. Essentially, it provides a guaranteed set of properties that all saved objects will have.

## Interface ICandleData

This interface represents a single candlestick, the fundamental building block for analyzing price action and running backtests. Each candlestick holds key information about a specific time interval, including when it began (`timestamp`), the opening price (`open`), the highest and lowest prices reached (`high`, `low`), the closing price (`close`), and the total trading volume (`volume`) during that period. Think of it as a snapshot of market activity over a set time. It's essential for calculations like VWAP and for simulating trading strategies over historical data.

## Interface DoneContract

This interface represents the information provided when a background task, whether it's a backtest or a live trading process, finishes running.  It tells you which exchange was used, the name of the strategy that completed, and whether the process was a backtest or a live execution.  You'll also find the trading symbol involved, like "BTCUSDT," included in this data. Think of it as a notification that a background task is done, along with key details about what just happened.


## Interface BacktestStatistics

This interface holds all the key statistical data derived from your backtesting runs. You’re provided with a detailed list of every closed trade, including its price, profit and loss, and timestamps. The `totalSignals` property simply tells you how many trades were evaluated. 

You can easily track how often your strategy wins (`winCount`) and loses (`lossCount`), and calculate the overall `winRate`. The `avgPnl` shows the average profit or loss per trade, while `totalPnl` represents the total cumulative profit across all trades. To understand the risk involved, `stdDev` measures volatility – a lower value is generally more desirable.

The `sharpeRatio` and `annualizedSharpeRatio` combine profit and volatility to provide a risk-adjusted return perspective, with higher values being preferable. `certaintyRatio` highlights the ratio of average wins to average losses. Finally, `expectedYearlyReturns` gives you an estimate of potential yearly profits based on trade duration and historical performance. Remember that any value deemed unsafe, such as resulting in NaN or Infinity, will appear as null.
