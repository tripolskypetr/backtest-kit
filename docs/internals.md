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

This function lets you plug in your own logging system into the backtest-kit framework. It's a way to capture and manage the framework's internal messages, like what's happening during a backtest. When you provide a logger, all log messages will be sent to your logger, and importantly, details about the backtest itself—like the strategy, exchange, and trading symbol—will be included automatically with each message, giving you valuable context. Just provide an object that implements the `ILogger` interface, and the framework will handle the rest.

## Function setConfig

This function lets you adjust the core settings of the backtest-kit framework. Think of it as tweaking the foundational rules for how your simulations run. You can provide a set of configuration options, and only the ones you specify will be changed; any settings you don't include will remain at their default values. This is a way to customize things like data handling, execution models, or other system-wide behaviors without needing to redefine everything from scratch. Essentially, it's a convenient way to tailor the framework to your specific backtesting needs.

## Function listWalkers

This function gives you a look at all the "walkers" currently set up in your backtest-kit system. Think of walkers as specialized components that analyze and process data during a backtest. 

It returns a list, and each item in that list describes a walker, letting you understand what's happening behind the scenes. 

This is handy if you're troubleshooting, want to generate documentation, or want to build a user interface that adjusts based on the walkers you've defined. Essentially, it’s a way to see the structure of your automated trading logic.


## Function listStrategies

This function helps you discover what trading strategies are available within your backtest-kit setup. It returns a list of strategy definitions, allowing you to see exactly which strategies have been added to the system. Think of it as a way to peek under the hood and understand the options you have for automated trading. You can use this to build tools that display available strategies or to troubleshoot any configuration issues.

## Function listSizings

This function lets you see all the sizing rules that are currently set up within the backtest-kit framework. It gathers all the sizing configurations – things like how much of an asset to buy or sell – that have been registered. Think of it as a way to peek under the hood and understand how your sizing logic is defined. You can use this information to troubleshoot issues, create documentation, or build user interfaces that adapt to the active sizing strategies. The function returns a list of these sizing schemas, allowing you to examine each one individually.

## Function listRisks

This function allows you to see all the risk configurations that your backtest kit is using. It gathers all the risk settings you've previously added and presents them in a neat list. Think of it as a way to peek under the hood and understand how your backtest is assessing potential risks. It's helpful for checking your setup, creating documentation, or building user interfaces that dynamically adjust based on these risk profiles.

## Function listFrames

This function lets you see all the different data structures, or "frames," that your backtest kit is using. Think of it as a way to peek under the hood and understand how your data is organized. It returns a list of these frame definitions, which can be helpful for troubleshooting, generating documentation, or building interfaces that automatically adapt to the frames you’re using. Essentially, it's a way to discover what kinds of data your trading system is dealing with.

## Function listExchanges

This function gives you a list of all the different exchanges that your backtest kit is set up to work with. Think of it as a way to see all the trading venues you’ve connected to your system. It's helpful if you need to check what exchanges are available, build a user interface that shows them, or just double-check your configuration. The function returns a promise that resolves to an array of exchange schema objects.

## Function listenWalkerOnce

This function lets you set up a listener that reacts to specific events happening within a walker process, but it only runs once. You provide a filter – a rule to determine which events you're interested in – and a callback function that will be executed when a matching event occurs. Once that event is processed, the listener automatically stops listening, so you don’t have to worry about cleaning up subscriptions. It’s a handy way to wait for a particular state or condition to be met during a walker's execution.

The `filterFn` defines the criteria for which events will trigger your callback.  The `fn` is the code that will run when an event passes that filter.

## Function listenWalkerComplete

This function lets you get notified when a backtest run finishes. Think of it as subscribing to an alert that goes off when all your trading strategies have been tested. The notification you receive contains the results of the entire backtest, presented in a structured format. Importantly, even if your notification handling involves some processing that takes time, the system ensures that notifications are handled one at a time, in the order they arrive, preventing any conflicts or unexpected behavior. You provide a function that will be called when the backtest is complete, and this function will receive the aggregated results.

## Function listenWalker

This function lets you keep an eye on how a backtest is progressing. It's like setting up a listener that gets notified after each trading strategy finishes running within a backtest. 

The listener function you provide receives an event containing information about the completed strategy. Importantly, even if your listener function does something that takes time, like making an API call, the backtest won't be blocked. It processes these notifications one at a time, ensuring things stay in order.  You're essentially getting updates about the backtest's progress in a controlled and sequential manner. The function returns an unsubscribe function that you can use to stop receiving those updates later on.

## Function listenValidation

This function lets you keep an eye on any errors that happen when your trading strategies are being checked for risk. Think of it as a safety net that catches problems before they cause issues. 

Whenever a validation check fails, this function will call back to a function you provide, allowing you to log the error or take other corrective actions. Importantly, it handles these errors one at a time, even if the function you provide needs to do something asynchronous, to ensure things stay orderly. This is really helpful for spotting and fixing problems during the testing and debugging phases.

You give it a function that will be called when an error is detected, and it returns another function you can use to unsubscribe from these error notifications later.

## Function listenSignalOnce

This function lets you listen for specific trading signals, but only once. It's perfect for situations where you need to react to a particular event and then stop listening. 

You provide a filter – a condition that must be met for the event to trigger – and a function to execute when that condition is met. Once the filter matches an event, your function runs, and the listener automatically stops. It's a simple way to wait for a signal and then move on.

The function takes two things: the filter you're using to identify the event and the action you want to take when that event happens. It returns a function to unsubscribe.

## Function listenSignalLiveOnce

This function lets you listen for specific trading signals as they come in during a live backtest run. Think of it as setting up a temporary alert – you provide a rule (the `filterFn`) that determines which signals you're interested in, and a function (`fn`) that gets executed only *once* when a signal matches that rule.  After that single execution, the subscription automatically stops, so you don't need to manage unsubscribing yourself. It only works with signals generated by `Live.run()`.


## Function listenSignalLive

This function lets you tap into the live trading signals generated by backtest-kit. It's how you get updates as a strategy executes in real-time.

Essentially, you provide a function as an argument – that function will be called whenever a new signal event occurs during a `Live.run()` execution. Think of it as setting up a listener that gets notified with each tick.

The function calls happen one after another, ensuring signals are processed in the order they arrive. This is useful if your logic depends on signal sequence. 

To stop listening, the function returns another function you can call.

## Function listenSignalBacktestOnce

This function lets you set up a listener that reacts to specific signals generated during a backtest run. It's designed for situations where you only need to process a signal once and then stop listening. You provide a filter – a test that determines which signals you're interested in – and a callback function that gets executed when a matching signal arrives. After the callback runs once, the listener automatically stops listening, simplifying your code and avoiding unnecessary processing. Essentially, it's a way to react to a single, targeted signal within a backtest.


## Function listenSignalBacktest

This function lets you tap into the flow of a backtest and react to the signals it generates. Think of it as setting up a listener that gets notified whenever a trading signal is produced during the backtest run. The signals are delivered one at a time, ensuring they're processed in the order they occurred. You provide a function that will be called with each signal, allowing you to build custom logic to analyze or respond to these events as the backtest progresses. It only works with signals coming directly from a `Backtest.run()` execution.


## Function listenSignal

This function lets you listen for signals from your backtesting strategy, like when a trade opens, closes, or changes status. It’s a way to be notified of what's happening during your backtest. The key is that these notifications are handled one at a time, even if your notification function takes some time to complete; this ensures things stay in order and avoids any unexpected problems from running things at the same time. You provide a function that will be called whenever a signal event occurs, and this function will receive details about that event. This subscription can be canceled by the function returned from `listenSignal`.

## Function listenProgress

This function lets you keep an eye on how your backtest is progressing. It’s like setting up a listener that gets notified as the backtest runs, especially useful when you’re performing tasks in the background.  The updates you receive are processed one at a time, ensuring that even if your callback function takes some time, everything stays in order. This provides a reliable way to monitor and potentially react to your backtest's progress.

You provide a function (`fn`) that will be called whenever a progress event happens. This function will receive information about the current progress state. The function you provide returns another function that you can call to unsubscribe from these progress updates.

## Function listenPerformance

This function lets you keep an eye on how your trading strategies are performing in terms of timing. It provides a way to receive updates as your strategy runs, specifically about how long different operations take. Think of it as a performance monitoring system for your backtesting.

It works by letting you register a callback function; whenever a performance metric is recorded, this function gets called.  Even if your callback itself does some asynchronous work, the updates are processed one at a time, ensuring things stay organized and predictable. It's a handy tool for spotting slow parts of your strategy and figuring out how to make it run faster.

The function returns another function – call that returned function to unsubscribe from these performance updates.


## Function listenError

This function lets you keep an eye on any errors that happen when tasks are running in the background, whether you're live trading or running a backtest. Whenever an error occurs within those background operations, this function will trigger a callback you provide. 

Importantly, even if the callback you provide to handle the error takes some time to run (like if it's an asynchronous function), the errors will be processed one at a time, in the order they happen. This ensures a consistent and predictable way to handle unexpected issues during background tasks.

To use it, you simply pass a function that will receive the error details whenever something goes wrong. This allows you to log errors, display notifications, or take corrective actions as needed.

## Function listenDoneWalkerOnce

This function lets you set up a listener that gets notified when a background task within the backtest-kit framework finishes, but only once. You provide a filter – a test to see if the completed task is the one you’re interested in – and a function to run when a matching task is done. The listener automatically removes itself after it has triggered once, so you don't have to worry about cleaning up. 

It’s helpful for situations where you need to react to the end of a specific background process just one time and then don’t need to be notified again.

The `filterFn` lets you choose which completed tasks trigger your callback function. The callback function itself will receive information about the finished task.

## Function listenDoneWalker

This function lets you monitor when a background task managed by the backtest-kit framework finishes processing. It’s designed to make sure that when a task completes, you can react to it in a predictable and controlled way.  Think of it as setting up an alert that gets triggered when a background operation is done. The function will execute your callback one at a time, even if that callback itself takes some time to run, ensuring that your reactions happen in the right order.  You provide a function that will be called when the background task is finished, and this function returns another function you can use to unsubscribe from those completion events when you no longer need them.

## Function listenDoneLiveOnce

This function lets you keep an eye on when background tasks running within your backtest finish, but only once. You provide a filter to specify which finishing tasks you’re interested in, and a callback function that gets executed when a matching task completes. After the callback runs, the subscription automatically stops, so you don’t have to worry about manually unsubscribing. It’s a clean way to react to specific background task completions without ongoing subscriptions.



You give it a way to check if the finishing task matches what you want, and then a function to run when a matching task finishes. The subscription automatically turns off after that single execution.

## Function listenDoneLive

This function lets you keep an eye on when background tasks initiated through `Live.background()` finish running. It provides a way to be notified as these tasks complete, ensuring you receive updates in the order they finished. The function takes a callback that gets triggered when a background task is done. To make things safe and predictable, it handles the callback even if it's asynchronous, processing events one at a time. You can unsubscribe from these notifications whenever you no longer need them.

## Function listenDoneBacktestOnce

This function lets you keep an eye on when a background backtest finishes, but only cares about specific completions. You provide a filter – a function that decides whether a particular backtest completion matters to you. When a backtest finishes and your filter says "yes," a callback function you provide gets executed just once. After that single execution, the function automatically stops listening, so you don't have to worry about manually unsubscribing. It's a simple way to react to relevant backtest completions without being bombarded with unnecessary notifications. 

You specify what to look for with the `filterFn` and define what should happen when a matching completion occurs with the `fn`.

## Function listenDoneBacktest

This function lets you be notified when a backtest finishes running in the background. It's useful if you need to perform actions after the backtest is complete, like updating a user interface or saving results. The notification happens automatically, and the code you provide will be executed in a predictable order, even if it involves asynchronous operations. Think of it as a reliable way to know when a background task is done and to react to its completion in a controlled way. You simply provide a function that will be called when the backtest finishes, and it handles the rest.

## Function getMode

This function tells you whether the trading framework is running in backtest mode or live trading mode. It's a simple way to check the environment your code is operating in – are you simulating historical data or actually placing trades? The function returns a promise that resolves to either "backtest" or "live," giving you a clear indication of the execution context.

## Function getDate

This function, `getDate`, helps you retrieve the current date within your trading strategy. It's useful for incorporating date-based logic into your decisions. When running a backtest, it provides the date associated with the timeframe currently being analyzed. If you’re running your strategy live, it returns the actual current date. Essentially, it gives you the date you need, whether you’re looking back in history or trading in real-time.

## Function getCandles

The `getCandles` function lets you retrieve historical price data, or "candles," for a specific trading pair. Think of it as requesting a timeline of price movements. You tell it which trading pair you're interested in, like "BTCUSDT" for Bitcoin against USDT, and how frequently you want the data, such as every minute or every hour.  You also specify how many data points you want back in time. The function then pulls this data from the exchange you're connected to. This is how you build a picture of past price behavior for analysis or backtesting trading strategies.

## Function getAveragePrice

This function helps you determine the Volume Weighted Average Price, or VWAP, for a specific trading pair. It looks back at the most recent five one-minute candles to figure out this average. The calculation involves using the high, low, and closing prices of those candles to find a typical price, then weighting that price by the volume traded. If there's no volume data available, it will simply calculate the average closing price instead. You just need to provide the symbol of the trading pair, like "BTCUSDT," to use this function.

## Function formatQuantity

This function helps you prepare quantity values for trading, ensuring they are formatted correctly according to the specific exchange you're using. It takes the trading pair symbol, like "BTCUSDT," and the raw quantity as input. The function then handles the complexity of applying the right number of decimal places based on that symbol’s exchange rules, giving you a properly formatted string ready for sending to the exchange. Effectively, it takes care of the formatting details so you don’t have to.

## Function formatPrice

This function helps you display prices correctly for different trading pairs. It takes a trading symbol like "BTCUSDT" and a raw price as input. It then formats the price to match the specific rules of the exchange you're using, ensuring the right number of decimal places are shown. This is useful for presenting prices in a user-friendly way, as it handles the exchange’s formatting requirements automatically.

## Function addWalker

This function lets you plug in a "walker" into the backtest-kit framework. Think of a walker as a specialized component that runs multiple strategy backtests simultaneously using the same data. It then analyzes and compares the results of these backtests based on a defined metric, giving you a broader perspective on how different strategies perform against each other. To use it, you provide a configuration object describing how the walker should operate. Essentially, it's a way to streamline the process of comparing several strategies at once.

## Function addStrategy

This function lets you officially add a trading strategy to the backtest-kit framework. Think of it as registering your strategy so the system knows about it and can manage it. When you add a strategy this way, it automatically checks to make sure your signals are well-formed, prevents the strategy from sending too many signals too quickly, and ensures the strategy's data is safely saved even if something unexpected happens during live trading. You provide a configuration object describing your strategy, and the framework handles the rest.

## Function addSizing

This function lets you tell the backtest-kit how to determine the size of your trades. Think of it as setting the rules for how much capital you're willing to risk on each trade. You provide a configuration object that specifies things like whether you want to use a fixed percentage of your capital, a Kelly Criterion approach, or something based on Average True Range (ATR). This object also includes details about your risk tolerance, limits on position size, and a way to receive updates during the sizing calculation process. Essentially, you’re customizing how the framework decides how much to buy or sell in each trade.

## Function addRisk

This function lets you set up how your trading framework manages risk. Think of it as defining the boundaries for your trading – how many positions you can have open at once, and what extra checks you want to perform before a trade happens. It allows for sophisticated risk controls, like monitoring portfolio metrics or checking for correlations between strategies.  Because multiple trading strategies share the risk configuration, you can analyze risk across your entire system. The framework keeps track of all active positions, making it possible for your custom validation functions to see the full picture before allowing or rejecting trading signals. You essentially provide a configuration object (`riskSchema`) that outlines these rules.

## Function addFrame

This function lets you tell backtest-kit how to create the different timeframes your backtest will use. Think of it as defining the building blocks – the daily, hourly, or minute-by-minute data – that your strategies will analyze. You provide a configuration object that specifies the start and end dates of your backtest, the interval (like one day, one hour), and a way to generate the actual timeframe data. Basically, you're setting up the data pipeline for your backtesting process.




It’s how you tell the system exactly what data slices you need to work with.

## Function addExchange

This function lets you tell backtest-kit about a new data source for trading, essentially connecting it to where your historical price data lives. You provide a configuration object that defines how to fetch that data – think of it as teaching the framework where to find the prices for different assets. The configuration tells it how to grab historical candlestick data, how to properly format price and quantity values for the exchange, and even how to calculate a Volume Weighted Average Price (VWAP) based on recent trading activity. Adding an exchange is a fundamental step to set up your backtesting environment.

# backtest-kit classes

## Class WalkerValidationService

The WalkerValidationService helps ensure your trading strategies are structured correctly by verifying their underlying components. It acts as a central registry for defining the expected format of your trading logic pieces, which we call "walkers."

You can think of it as a way to set up rules for how your strategies *should* be built.

First, you register the expected structure for each walker using `addWalker`. Then, when you want to check if a strategy adheres to these rules, you use the `validate` function.  The `list` function allows you to see all the walker schemas you've registered. Essentially, it keeps track of your strategy blueprints.

## Class WalkerUtils

WalkerUtils is a helper class designed to make working with walker comparisons easier. It streamlines the process of running comparisons, automatically handling some of the underlying details like identifying the exchange and frame names from the walker configuration. 

You can use the `run` method to execute a walker comparison and receive the results step-by-step.  If you just need to run a comparison in the background without needing to see the individual results – perhaps for logging or triggering other actions – the `background` method is perfect.

To retrieve all the results from a comparison, use `getData`.  If you need a formatted report, `getReport` will generate a markdown document summarizing the comparison. Finally, `dump` lets you easily save that report to a file. WalkerUtils is available as a single, easy-to-use instance.

## Class WalkerSchemaService

The WalkerSchemaService helps you keep track of your trading strategies, or "walkers," in a structured and organized way. It acts as a central place to store and manage the blueprints for your strategies.

Think of it as a librarian for your trading logic. You can register new strategy blueprints using `addWalker()` and then easily find them later by their name.

The service uses a special system, ToolRegistry, to ensure that these blueprints are stored accurately and with the correct data types.

Before a new strategy blueprint is added, it's checked to make sure it has all the necessary parts with the right types using `validateShallow`. This helps prevent errors later on.

You can also update existing strategy blueprints with changes, like tweaking a setting, by using `override`.  And of course, `get` lets you retrieve a specific strategy blueprint by its name when you need it.

## Class WalkerMarkdownService

The WalkerMarkdownService helps you automatically create and save reports about your trading strategies. It keeps track of how different strategies perform during backtesting, gathering detailed results as the testing progresses.

It generates these reports in a readable markdown format, making it easy to compare strategy performance side-by-side. The reports are saved to files, organized by strategy, in a designated log directory.

The service automatically handles things like creating the necessary directories and ensuring the reports are properly formatted. It’s designed to be simple to use – you just need to connect it to your backtesting environment and let it do its work. You can clear the accumulated data for specific strategies or for all strategies at once, and the initialization process happens automatically when you start using the service.

## Class WalkerLogicPublicService

This service helps coordinate and manage the execution of automated trading strategies, making it easier to run and track them. It essentially acts as a bridge, simplifying how you interact with the core logic while automatically passing along essential information like the strategy name, exchange, and frame.

You can think of it as a conductor for your backtesting orchestra, ensuring everything plays together smoothly. 

The `run` method is the main way to use it, allowing you to kick off a comparison of trading strategies for a specific asset, with the framework handling the details of context and dependencies. It runs backtests for all your defined strategies.


## Class WalkerLogicPrivateService

This service helps you compare different trading strategies against each other. It manages the entire process of running these strategies, tracking their performance, and presenting the results.

Essentially, you give it a symbol (like a stock ticker), a list of strategies you want to test, a metric to evaluate them on (like total profit), and some context information. 

The service then runs each strategy one at a time, using another service internally to handle the backtesting itself. As each strategy finishes, you're given updates on its progress. Finally, you’ll get a complete set of results, showing how each strategy performed and ranking them against each other. It’s like having a referee for your trading strategy competition.

## Class WalkerCommandService

WalkerCommandService acts as a central point for interacting with the core walker functionality within the backtest-kit. Think of it as a convenient helper, providing access to several underlying services that handle different aspects of the backtesting process, like validating strategies, exchanges, and frames. 

It's designed to be easily used within your application's dependency injection system. The `run` method is the primary way to initiate a comparison between different walkers, allowing you to specify the symbol you're interested in and providing context about which walker, exchange, and frame names are involved. This method returns a stream of results, enabling you to progressively analyze the comparison data.

## Class StrategyValidationService

The StrategyValidationService helps ensure your trading strategies are well-defined and consistent before you start backtesting. Think of it as a central registry for your strategies, allowing you to formally describe them. 

You can add strategy definitions – essentially blueprints of how a strategy should behave – to the service. These definitions include details about the strategy’s schema and risk profile. 

The service lets you validate that a strategy exists and that its risk profile is correctly configured, giving you confidence in your setup.  It also provides a convenient way to list all the strategies you've registered. 

Essentially, this service helps maintain order and reliability in your backtesting environment by making sure your strategies are set up properly.


## Class StrategySchemaService

The StrategySchemaService helps you keep track of your trading strategies and their setups in a structured way. It's like a central catalog where you can register different strategy blueprints. 

You can add new strategy definitions using `addStrategy()` and then easily find them again later by their names using `get()`. Before a strategy is officially added, the service checks to make sure it has all the necessary components with `validateShallow` ensuring a basic level of correctness.

If you need to update a strategy's details, `override()` allows you to make changes to an existing definition, rather than creating a completely new one. This service uses a special type-safe system for storing these strategy definitions, ensuring that they are organized and consistent.

## Class StrategyGlobalService

StrategyGlobalService acts as a central hub for managing and executing strategies within the backtesting framework. It combines strategy execution with contextual information like the trading symbol, timestamp, and whether it's a backtest scenario.

It keeps track of strategy validations to avoid unnecessary repetition, and logs those activities. 

You can use it to fetch the latest pending signal for a particular symbol – useful for monitoring things like take profit and stop-loss orders.

The `tick` function lets you check the current signal status at a specific point in time. Similarly, `backtest` lets you run quick simulations against historical candle data.

For situations where you want to temporarily halt signal generation, the `stop` function provides a way to pause a strategy. Finally, `clear` can be used to refresh the strategy from its cached state, ensuring you’re working with the latest version.

## Class StrategyConnectionService

The StrategyConnectionService acts as a central hub for managing and executing trading strategies. It intelligently routes requests to the correct strategy implementation based on the active context. To improve performance, it keeps a record of frequently used strategy instances, retrieving them quickly when needed.

Before you start any trading operations, it’s important to make sure everything is properly initialized. The `tick()` function handles live trading, evaluating market conditions and generating signals, while the `backtest()` function simulates trading using historical data.

If you need to temporarily halt a strategy’s signal generation, you can use the `stop()` function. Conversely, the `clear()` function allows you to force a fresh start for a strategy, discarding any cached data and prompting re-initialization.

## Class SizingValidationService

The SizingValidationService helps ensure your trading strategies are using correctly defined sizing methods. It acts as a central place to register and verify the sizing rules your backtest kit uses to determine trade sizes.

You can add sizing schemas, each defining how much capital to risk on a trade, using the `addSizing` method.  The `validate` method checks if a sizing method has been registered and can optionally verify its method type.  If you need to see what sizing methods are currently registered, the `list` method provides a straightforward way to retrieve a list of all available sizing schemas. Essentially, it’s a safeguard to prevent sizing-related errors during backtesting.

## Class SizingSchemaService

This service helps you keep track of your sizing schemas, which define how much to trade in different scenarios. It uses a special type-safe system to store these schemas, ensuring they’re consistent. 

You can add new sizing schemas using the `register` method, update existing ones with `override`, and retrieve them by name using `get`. Before a schema is added, it’s checked to make sure it has the necessary components to prevent errors later on. The service also keeps a record of all registered schemas, making it easy to manage them.

## Class SizingGlobalService

This service handles the calculations needed to determine how much of an asset to trade, considering your risk management rules. It acts as a central point for position sizing, coordinating with other services to ensure calculations are accurate and consistent. 

The `calculate` method is the primary way to use this service; it takes parameters defining the trade and a context to understand the sizing operation and returns the calculated position size. You'll find this service is used behind the scenes to power your strategy’s trading decisions. 

It relies on a connection service for the sizing data and a validation service to make sure the sizing calculations are safe and reasonable. The service also keeps a record of what's happening through a logger.

## Class SizingConnectionService

This service acts as a central hub for handling position sizing calculations within the backtesting framework. It’s designed to connect your trading strategy with the specific sizing method you’ve chosen. 

Think of it as a dispatcher: you tell it which sizing method you want to use (by providing a sizing name), and it makes sure the request goes to the right implementation. 

To optimize performance, it keeps a record of the sizing methods it’s already used, so it doesn't have to recreate them every time.

The `calculate` function takes your sizing parameters and context and figures out the appropriate position size, leveraging the configured sizing method. It handles various strategies, including fixed percentage, Kelly Criterion, and ATR-based sizing. 

If your strategy doesn't have a sizing configuration, the sizing name will be an empty string.

## Class ScheduleUtils

This class helps you keep track of and understand how your trading strategies are generating and handling scheduled signals. It's designed to be simple to use, acting as a central place to get information and create reports.

Think of it as a way to monitor the timing and efficiency of your signals – you can see how many signals are scheduled, how often they're cancelled, and how long they typically wait. 

You can request data for a specific strategy to get a detailed view, or generate a nicely formatted markdown report summarizing the signal activity. The class also lets you save these reports to a file. Finally, it provides a way to clear the accumulated data, either for a specific strategy or all strategies at once, so you can start fresh.


## Class ScheduleMarkdownService

This service helps you automatically create reports detailing the scheduling and cancellation of trading signals. It keeps track of what’s happening with your strategies – when signals are scheduled, when they's cancelled, and even calculates useful statistics like cancellation rates and average wait times.

Essentially, it listens for signal events, organizes them by strategy, and then turns that information into nicely formatted markdown tables that it saves to files. These reports are automatically generated and stored in a designated folder, making it easy to monitor and analyze your trading strategy's behavior.

You can clear the stored data for individual strategies or for all strategies at once. Initialization happens automatically when the service is first used.

## Class RiskValidationService

The RiskValidationService helps you ensure your trading strategies are managing risks properly. Think of it as a central place to define and check on different types of risks your system might encounter. 

You can add risk schemas, which are essentially blueprints for what a specific risk looks like, using the `addRisk` function. The `validate` function lets you confirm if a risk profile matches the defined schema. If you need to see all the risk schemas you've registered, the `list` function provides that information.  The service uses a logger to keep track of what's happening during validation.

## Class RiskSchemaService

The RiskSchemaService helps you keep track of your risk profiles in a safe and organized way. It acts as a central hub for defining and managing these profiles, ensuring consistency and preventing errors.

You can add new risk profiles using the `addRisk()` method, and retrieve them later by their assigned names. The service uses a specialized registry to store these profiles in a type-safe manner.

Before a new risk profile is added, a quick check (`validateShallow`) confirms that it has all the necessary properties and they are of the expected types.

If a risk profile already exists, you can update parts of it using the `override` method.  This lets you modify existing profiles without recreating them entirely. Finally, the `get` method simply retrieves a risk profile by its name.

## Class RiskGlobalService

This service handles risk management tasks, acting as a central point for validating and tracking trading signals against established risk limits. It works closely with a connection service to communicate with the risk management system. 

The service keeps a record of open signals, letting you know if a trade is permitted based on configured risk constraints.  It also caches validation results to avoid unnecessary checks, making the process more efficient. 

You can use this to register new signals when a trade is opened, and to remove signals when a trade closes. It provides a way to clear out all risk data or selectively clear data for a specific risk configuration. The logger service is used to record what's happening with risk validation.

## Class RiskConnectionService

The RiskConnectionService acts as a central hub for managing risk checks during trading. It figures out which specific risk implementation to use based on a name you provide. To make things faster, it remembers those implementations so it doesn't have to recreate them every time. 

It’s responsible for checking whether a trading signal is allowed, taking into account things like portfolio drawdown and how much exposure you have to different symbols. You also use it to register when a signal is opened or closed, ensuring the risk system is always up-to-date. 

If you need to, you can clear the cached risk implementations, which might be useful for testing or resetting things. Strategies without any specific risk configuration simply use an empty string as the risk name.

## Class PositionSizeUtils

This class offers helpful tools for figuring out how much of an asset to trade in each position. It provides pre-built functions for several common sizing strategies, like using a fixed percentage of your account, applying the Kelly Criterion, or basing the size on the Average True Range (ATR).

Each of these sizing methods is a function you can call, and they're designed to make sure the information you provide is compatible with the specific sizing approach you’ve chosen. This helps prevent errors and ensures your calculations are accurate.

Essentially, this class simplifies the often-complex process of position sizing, giving you ready-to-use methods you can incorporate into your trading strategies.

## Class PersistSignalUtils

This class helps keep track of your trading signals, ensuring they're safely stored and readily available even if things go wrong. Think of it as a reliable memory for your trading strategies.

It automatically manages where your signals are saved, providing a dedicated storage space for each strategy. You can even customize how these signals are stored using your own adapter. 

The `readSignalData` function is used to retrieve previously saved signal information, allowing your strategies to resume where they left off. Conversely, `writeSignalData` ensures that new or updated signal data is reliably saved to disk, protecting against data loss. This functionality is particularly important when your strategies are running live.

If you're working with a specialized storage solution, you can register your own persistence adapter using `usePersistSignalAdapter` to integrate with it.

## Class PersistRiskUtils

This class helps manage how your trading positions are saved and restored, particularly when dealing with different risk profiles. Think of it as a reliable way to keep track of your active positions even if your program unexpectedly stops.

It automatically handles the details of storing and retrieving this data, providing a clean and efficient way to persist your trading state.  It remembers which storage method to use for each risk profile, and offers flexibility to use different storage solutions if you need to.

When your program starts up, this class will load your positions back from storage. After you make changes to your positions, it will save them to disk in a way that prevents data corruption, even if there's a crash.  You can even plug in your own custom storage methods if the built-in ones don't quite fit your needs.

## Class PerformanceMarkdownService

This service helps you understand how your trading strategies are performing by collecting and analyzing data. It listens for performance events, keeps track of metrics for each strategy individually, and then calculates things like average performance, minimums, maximums, and percentiles.

You can ask it to generate detailed reports in markdown format, including analysis of potential bottlenecks. These reports are saved to your logs folder.

The service has a `clear` function to wipe the collected data when needed, and an `init` function to set everything up initially – it only runs this setup once. To keep track of performance, you'll use the `track` function from within your trading logic. You can also retrieve the summarized performance data for a specific strategy with `getData` and request a full report with `getReport`.

## Class Performance

The Performance class helps you understand how your trading strategies are doing. It provides tools to gather and analyze performance data, so you can pinpoint areas for improvement.

You can retrieve detailed statistics for a specific strategy, including counts, durations, averages, and percentiles that highlight potential bottlenecks. 

It also generates readable markdown reports summarizing the strategy’s performance, making it easy to spot inefficiencies. You can save these reports directly to your computer for later review. 

Finally, the class offers a way to clear the stored performance data, effectively resetting the system when needed.

## Class LoggerService

The LoggerService helps ensure consistent logging throughout the backtest-kit framework by automatically adding important context information to your log messages. Think of it as a central point for all logging, making it easier to understand what’s happening during a backtest.

You can use the provided `log`, `debug`, `info`, and `warn` methods to record different levels of messages. These methods automatically enrich your messages with details like the strategy name, exchange, frame, and execution context (symbol, time, and whether it’s a backtest).

If you don't provide a custom logger, the service defaults to a "no-op" logger that does nothing, so it won't impact performance.

If you need more control over the logging behavior, you can plug in your own logger implementation using the `setLogger` method. The internal `methodContextService` and `executionContextService` manage the context information being added to your logs.

## Class LiveUtils

LiveUtils provides helpful tools for running and monitoring live trading activities. It acts as a central point for accessing live trading functionality, simplifying the process and adding features like automatic recovery from crashes.

The `run` method is the primary way to execute live trading, returning a continuous stream of results which can be processed to analyze performance. This method also handles saving and restoring the trading state, ensuring operations can resume even if the system unexpectedly shuts down.

If you just need to run live trading for tasks like logging or persistent data without directly processing the results, the `background` method provides a convenient way to do so. It keeps the trading process running in the background, silently executing. 

You can also easily get statistics about how a strategy is performing using `getData` and generate detailed reports of its activity with `getReport`. Finally, `dump` provides a simple way to save these reports to a file for later review.

## Class LiveMarkdownService

The LiveMarkdownService helps you automatically generate detailed reports about your trading strategies as they run. It listens for all the key events – like when a strategy is idle, opens a trade, is active, or closes a trade – and keeps track of them for each strategy.

You can then request these reports as nicely formatted Markdown tables that describe each event, along with important statistics like your win rate and average profit/loss. The service automatically saves these reports to files on your disk, making it easy to review your strategies' performance over time.

The service manages storage separately for each strategy, ensuring that the data for one strategy doesn't interfere with another.  You have the option to clear the accumulated data for individual strategies or clear all data at once.  Finally, the service initializes itself automatically when you first use it, subscribing to the necessary trading events.

## Class LiveLogicPublicService

The LiveLogicPublicService helps manage and run live trading operations, making it easier to work with the backtest-kit framework. It acts as a convenient layer on top of the private service, automatically handling things like knowing which strategy and exchange you’re working with, so you don’t have to pass those details repeatedly.

It continuously runs trading for a specific symbol and provides a stream of results – signals to open, close, or cancel positions – as an ongoing sequence.  Because it’s designed to run indefinitely, it’s built to recover gracefully from crashes, preserving its state so you can pick up where you left off.  The service handles the context automatically, letting you focus on the trading logic itself.

## Class LiveLogicPrivateService

The LiveLogicPrivateService helps orchestrate live trading using a continuous, streaming process. Think of it as a tireless worker constantly monitoring a trading symbol. 

It runs in an endless loop, regularly checking for new signals and yielding updates – specifically, when trades are opened or closed. You won't see updates for trades that are simply active or idle.

This service is designed to be resilient; if something goes wrong and the process crashes, it will automatically recover and resume trading from where it left off. It efficiently sends trading results as a stream, and the whole operation never completes, ensuring continuous monitoring. 

The service relies on several supporting services – a logger for tracking events, a global service to manage strategy information, and a method context service for tracking actions. The `run` method is the core of the process, taking a trading symbol as input and returning an async generator that provides the trading updates.

## Class LiveCommandService

This service acts as a central point for interacting with live trading functionalities within the backtest-kit framework. Think of it as a helpful layer that makes it easier to manage dependencies when you want to run a trading strategy in real-time.

It bundles together several key components, including services for logging, accessing public live logic, validating strategies and exchanges, handling schema information, and performing risk validations. 

The `run` method is the main entry point to start live trading. It takes a symbol (like a stock ticker) and some context information (like the strategy and exchange names) and then continuously generates results – showing you what's happening as the strategy executes, with built-in mechanisms to handle unexpected errors and keep things running smoothly. This is essentially an ongoing, resilient stream of live trading data.

## Class HeatUtils

The `HeatUtils` class helps you visualize and understand how your trading strategies are performing. Think of it as a convenient tool for creating heatmaps of your portfolio's performance. 

It automatically gathers data from your trading signals, breaking down the results for each individual symbol and providing an overall portfolio view.  You can easily retrieve this data to create reports.

Generating a markdown report is simple – it presents a table showing key metrics like total profit/loss, Sharpe Ratio, maximum drawdown, and the number of trades, all sorted to highlight the best performing symbols. 

Finally, you can save these reports directly to disk as markdown files, making it easy to share and analyze your trading results. The class is designed to be readily accessible, acting as a single instance you can use throughout your backtesting process.

## Class HeatMarkdownService

The Heatmap Service is designed to provide a clear, visual summary of your trading portfolio's performance. It collects data from closed trades, organizes it by strategy and individual asset, and presents it in a user-friendly format.

Think of it as a central hub for understanding how your strategies are doing, giving you key metrics like total profit/loss, Sharpe Ratio, and maximum drawdown for each asset and a combined view for each strategy.

The service generates reports in Markdown, making it easy to share and review your results. It handles potential errors in calculations gracefully, preventing issues caused by missing data. 

It maintains data for each strategy separately, allowing for easy comparison and analysis. The service initializes automatically, but you can also clear the data if you need to start fresh, either for a specific strategy or all strategies.

## Class FrameValidationService

The FrameValidationService helps ensure your trading strategies are set up correctly by checking the structure of the data they expect. Think of it as a quality control system for your data frames.

You can use this service to register the expected format (schema) for each data frame your strategy uses.  It lets you define what each frame *should* look like.

The `addFrame` method is used to tell the service about a new data frame and its required format. The `validate` method then checks if a given data frame matches the expected format you’ve registered. Finally, `list` allows you to see all the frame formats currently registered within the service. This helps you easily keep track of what data structures your trading system relies on.

## Class FrameSchemaService

The FrameSchemaService helps you keep track of the blueprints – or schemas – that define how your trading strategies understand market data. Think of it as a central place to store and manage these schemas, ensuring everyone is on the same page about what data each strategy expects. 

It uses a special system for type-safe storage, and it verifies the structure of each schema before it's added.

You can add new schemas using `register`, update existing ones with `override`, and easily retrieve a schema by its name using `get`.  This service helps maintain a clean and organized system for your trading frameworks.

## Class FrameGlobalService

This service helps manage the timeframe data needed for backtesting. It works closely with the connection to your data source and performs validation checks.

The `getTimeframe` function is its primary tool—it takes a symbol (like 'AAPL') and a timeframe name (like '1h' for hourly data) and returns a promise that resolves to an array of dates representing the available data for that symbol and timeframe. Think of it as requesting the dates for a specific stock's hourly data.

It leverages a logger for tracking what's happening and utilizes a connection service to retrieve the actual data and a validation service to make sure the data makes sense.

## Class FrameConnectionService

The FrameConnectionService acts as a central hub for interacting with different trading frames, like historical data sets. It automatically directs your requests to the correct frame based on the trading context. 

To optimize performance, it keeps a record of the frames it's using, so it doesn't have to recreate them every time you need one. 

You can use it to get a specific frame, providing a name, and it will handle retrieving or creating it. It also provides a way to determine the start and end dates of a backtest timeframe for a given trading symbol. 

In live trading, it operates without any frame constraints as the frameName will be an empty string.

## Class ExchangeValidationService

The ExchangeValidationService helps ensure your trading strategies are compatible with different exchanges. Think of it as a central place to register and verify the structure of data coming from various exchanges.

You start by adding exchange schemas, essentially defining the expected format of data for each exchange you work with. The `validate` function then lets you check if a particular exchange's data adheres to the schema you've registered. 

If you need to see which exchanges are currently registered and their associated schemas, the `list` function provides a convenient way to get that information. The service uses a logger to keep track of its operations, helping you debug any potential issues.

## Class ExchangeSchemaService

This service keeps track of different exchanges and their specific configurations, ensuring everything is handled consistently and safely. It uses a special system to store these configurations in a way that prevents errors due to incorrect data types. 

You can add new exchanges using the `addExchange()` function, and get information about existing exchanges by their name.  Before an exchange is added, it's checked to make sure it has all the necessary information in the right format.  If an exchange already exists, you can update parts of its configuration using the `override()` function.

## Class ExchangeGlobalService

The ExchangeGlobalService acts as a central hub for interacting with an exchange, streamlining operations by automatically providing essential context like the trading symbol, the specific time, and backtest settings. It builds upon the ExchangeConnectionService and ExecutionContextService to ensure everything operates seamlessly.

Inside, it manages validation of exchange configurations, remembering previous validations to avoid unnecessary repetition and keeping a log of these activities.

This service offers methods for retrieving historical and future candle data, calculating average prices, and formatting both prices and quantities—all while accounting for the current context of the operation. Think of it as a helper that makes fetching data and preparing it for use much simpler and more reliable.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges. It automatically figures out which exchange to use based on the current context, so you don’t have to manually specify it. 

It keeps a record of the exchange connections it creates, reusing them when possible to speed things up.  You can get historical price data (candles) and the next set of candles, and even calculate the average price, which will pull live data when running live and use historical data when backtesting. 

It also helps ensure that the prices and quantities you're working with are formatted correctly according to the rules of the specific exchange you're using. This is critical for placing orders properly.

## Class ClientSizing

The ClientSizing class helps strategies figure out how much to trade. It's a flexible tool that allows you to choose from different sizing methods like fixed percentages, the Kelly Criterion, or using Average True Range (ATR). You can also set limits on how much can be traded, ensuring positions stay within defined boundaries. This class provides a way to validate sizing calculations and log important information about the process, and it's a key component in determining the optimal position size for each trade. 

The `calculate` method is the core functionality, taking parameters and returning the calculated position size. The `params` property holds the configuration settings used for sizing calculations.

## Class ClientRisk

ClientRisk helps manage risk for your trading portfolio, acting as a safety net to prevent exceeding pre-defined limits. It’s designed to work with multiple trading strategies simultaneously, allowing for a broad view of potential risk across your entire portfolio.

Think of it as a gatekeeper; before a trading strategy opens a new position, ClientRisk checks to ensure it adheres to configured rules like maximum concurrent positions. It also supports custom risk validations, giving you the flexibility to create very specific risk checks.

The system keeps track of all open positions across all strategies in a central location.  It automatically handles initializing and persisting this position data, and it simplifies the process of adding or removing signals (trading orders) to the system.  The checkSignal function performs these risk validations before allowing a trade to execute, and notifies you of the outcome.


## Class ClientFrame

The ClientFrame class helps create the sequences of timestamps needed for backtesting trading strategies. Think of it as a tool for building the timeline your backtest will run on. It cleverly avoids generating the same timestamps multiple times by caching results, making the process more efficient. 

You can control the spacing of these timestamps—from one-minute intervals up to three-day jumps—to match the resolution of your data.  ClientFrame also allows you to add custom checks and logging during timeframe generation, giving you more control over the backtesting setup. 

The `getTimeframe` method is the core of this class; it's what produces the date arrays for backtesting, remembering past results to avoid unnecessary work.

## Class ClientExchange

The `ClientExchange` class provides a way to interact with an exchange, specifically designed for backtesting. It lets you retrieve historical and future candle data, essential for simulating trading strategies. You can request candles from the past, moving backward in time, or look ahead to get candles needed for how long a trading signal lasts. 

It can also calculate the Volume Weighted Average Price (VWAP), giving you an idea of the average price a large volume of trades happened at, based on recent 1-minute candles.  The number of candles used in the VWAP calculation is automatically determined by a global setting.

Finally, the class offers convenient functions to format quantities and prices to match the exchange's specific requirements, ensuring your orders are correctly interpreted. It’s built for efficient memory usage, making it suitable for intensive backtesting scenarios.

## Class BacktestUtils

BacktestUtils is a handy tool to help you run and analyze backtest simulations within the trading framework. Think of it as a central place to kick off backtests and get useful information about them.

You can use the `run` method to execute a backtest for a specific trading symbol and get results as they become available.  There's also `background`, which is perfect when you want to run a backtest in the background for actions like logging or triggering callbacks, without needing to collect all the data.

To understand how a strategy performed, you can use `getData` to retrieve statistics based on closed signals or `getReport` to generate a detailed markdown report. Finally, if you need to save a report for later review, `dump` allows you to easily save the markdown report to a file.  It’s a singleton, so there’s only one instance of this tool available throughout the system.

## Class BacktestMarkdownService

The BacktestMarkdownService helps you create easy-to-read reports about your trading backtests. It listens for trading signals as your backtest runs and keeps track of how those signals performed. 

It organizes the data by strategy, giving each one its own dedicated storage area to avoid confusion. The service automatically generates markdown tables that neatly display information about each closed signal.

You can save these reports directly to your computer, in a folder named `logs/backtest`, with each strategy's report in its own file. The service takes care of creating the folder if it doesn't exist. 

It also allows you to clear out the stored data when you’re done with a backtest, either for a specific strategy or for all strategies.  The service initializes itself automatically when you start using it, so there’s nothing extra you need to do to get it set up.

## Class BacktestLogicPublicService

BacktestLogicPublicService helps you run backtests in a more convenient way. It handles the behind-the-scenes context management – things like the strategy name, exchange, and timeframe – so you don’t have to pass them around manually every time you need them. 

Think of it as a layer on top of the private backtesting logic that simplifies the process. It uses a `loggerService` for logging and internally relies on `backtestLogicPrivateService` to perform the actual backtesting calculations.

The core functionality is the `run` method.  This method takes a symbol and automatically injects the strategy, exchange, and frame information into the backtesting process. It returns a stream of backtest results, allowing you to process them step-by-step as the backtest progresses.

## Class BacktestLogicPrivateService

This service manages the entire backtesting process, acting as a conductor for your trading strategies. It efficiently handles timeframes and signals, retrieving data only when necessary. 

Think of it as a pipeline: it pulls in timeframes, processes signals, fetches candle data, and runs your backtesting logic. Importantly, it doesn't store everything in memory – instead, it sends results to you as they become available, which is great for large datasets. 

You can also stop the backtest early if needed.

The `run` method is the core – you provide a symbol, and it returns a stream of backtest results for closed signals. This service relies on other global services for things like logging, strategy management, exchange data, and timeframes.

## Class BacktestCommandService

This service acts as a central hub for running backtests within the system. Think of it as a convenient way to access the core backtesting engine and its related components. 

It's designed to be used with dependency injection, which helps manage how different parts of the backtesting process connect to each other. You'll find it provides access to services that handle logging, strategy validation, risk assessment, and the actual backtesting logic.

The main function you'll use is `run`.  It kicks off a backtest for a specific trading symbol, taking into account the strategy, exchange, and timeframe you're using. The result is delivered piece by piece.


# backtest-kit interfaces

## Interface WalkerContract

The `WalkerContract` represents progress updates during a strategy comparison run. Think of it as a report card given after each strategy is tested. It tells you which strategy just finished, what exchange and symbol it was tested on, and its performance statistics. 

You're given key details like the walker's name, the symbol being tested, and the strategy's name. Importantly, it includes the strategy's performance metrics and the current best-performing strategy found so far, along with its metric value.  The contract also keeps track of how many strategies have been tested and the total number of strategies planned for the comparison, giving you a clear sense of how much of the testing remains.

## Interface TickEvent

The TickEvent interface provides a standardized way to represent all the important data points related to trading events, regardless of what’s happening. Think of it as a single container holding all the information you need to analyze and report on a trade.

Each TickEvent includes a timestamp marking when the event occurred, a description of the event type (idle, opened, active, or closed), and the trading symbol involved. For trades that are actively happening or have concluded, it also provides details like the signal ID, position type, a note about the signal, the open price, take profit and stop loss levels, and the P&L percentage.  If a trade has closed, you'll find additional information like the reason for closure and the duration of the trade. Effectively, this interface lets you track every step of a trade in a consistent and manageable way.

## Interface ScheduleStatistics

This object helps you understand how your scheduled signals are performing. It gives you a breakdown of every event—both those that were scheduled and those that were cancelled—along with overall counts of each type. You’ll find the total number of scheduled signals, cancelled signals, and the overall cancellation rate, expressed as a percentage. It also provides the average wait time for cancelled signals, measured in minutes. This information is invaluable for monitoring and fine-tuning your trading strategies to minimize unwanted cancellations.

## Interface ScheduledEvent

This interface gathers all the key details about scheduled and cancelled trading events into one place, making it easier to generate reports and analyze performance. Each event includes a timestamp marking when it occurred, and specifies whether it was a scheduled or cancelled signal. 

You'll find information about the trading pair involved (symbol), a unique identifier for the signal (signalId), and the type of position taken (position). 

There’s also a note field for any special instructions or context associated with the signal. 

For scheduled events, you have the entry price, take profit, and stop loss levels. If an event was cancelled, you’ll see the close timestamp and the duration the signal was active.

## Interface ProgressContract

This interface helps you monitor the progress of your backtesting runs. It's designed to provide updates as your backtest is executing in the background.

You'll receive events containing details like the exchange and strategy being used, the trading symbol involved, and the total number of historical data points being processed. It also tells you how many frames have already been analyzed and provides a percentage representing how much of the backtest is complete. Essentially, this gives you a clear picture of how your backtest is advancing.

## Interface PerformanceStatistics

This interface holds the combined performance data for a trading strategy. It provides a structured way to understand how a strategy performed over time.

You'll find the strategy's name clearly listed, alongside the total number of performance events that were tracked. The `totalDuration` property tells you how long the strategy ran for, summing up all the individual metrics' execution times.

The `metricStats` section breaks down the data further, grouping statistics by metric type, allowing for deeper analysis. Finally, the `events` array contains all the raw performance data points, giving you access to the most detailed information if needed.

## Interface PerformanceContract

The PerformanceContract lets you keep track of how your trading strategies are performing. It records information about different operations, like how long they take to execute, giving you valuable insights for optimization. Each record includes a timestamp, a reference to the previous event's timestamp (if any), and the type of operation being measured. You’ll also find the name of the strategy, the exchange used, the symbol being traded, and whether the metric was generated during a backtest or a live trading session.  This data helps you pinpoint slowdowns and improve the overall efficiency of your trading system.

## Interface MetricStats

This object holds a collection of statistics gathered for a specific performance measurement, like order execution time or data processing duration. It tells you how many times a particular activity was measured, the total time spent on it, and various summary statistics describing its performance.

You'll find the average duration, the shortest and longest durations, and a measure of how spread out the durations are using the standard deviation. It also provides percentiles like the 95th and 99th, showing the duration experienced by 95% and 99% of the measurements respectively.

Finally, it details statistics related to wait times – the time spent waiting between events – providing minimum, maximum, and average wait times. This information is valuable for understanding delays and bottlenecks in your trading system.

## Interface LiveStatistics

The `LiveStatistics` interface provides a detailed look at your live trading performance. It keeps track of every event that occurs during trading, from idle periods to opened, active, and closed signals, giving you a complete record. 

You'll find key metrics like the total number of events, the number of closed signals, and how many of those were wins versus losses. It calculates the win rate, which represents the percentage of profitable trades. 

The interface also provides insights into profitability with metrics like average PNL per trade and total PNL across all trades. For risk management, it includes volatility measures like standard deviation and the Sharpe Ratio, helping you assess your risk-adjusted returns. Finally, it calculates an expected yearly return based on trade duration and profitability. All numeric values are safely handled, appearing as null if any calculation leads to unreliable results.

## Interface IWalkerStrategyResult

This interface, `IWalkerStrategyResult`, represents the outcome of running a single trading strategy within a broader comparison process. It neatly packages the key information about that strategy’s performance. You’ll find the strategy’s name clearly identified, along with a set of statistics detailing its backtest results – things like profit, drawdown, and Sharpe ratio are included.  A single metric value is also stored, which is used to compare strategies against each other. Finally, the `rank` property indicates where the strategy stands in the overall comparison, with the best performing strategy holding the rank of 1.

## Interface IWalkerSchema

The IWalkerSchema defines how you set up A/B tests within the backtest-kit framework. Think of it as a blueprint for comparing different trading strategies against each other.

You’re essentially telling the system which strategies you want to evaluate, what exchange and timeframe to use for all of them, and what metric—like Sharpe Ratio—you want to optimize. 

Each test setup needs a unique identifier (walkerName) and you can add a note to help explain what the test is doing.  

You have the option to provide lifecycle callbacks to hook into different stages of the backtesting process.

## Interface IWalkerResults

The `IWalkerResults` object holds all the information gathered after a strategy comparison, often referred to as a "walk." It tells you which strategy walker ran, what asset (symbol) and exchange were used for testing, and the timeframe (frame) it operated on. 

You'll find details about the optimization metric used – like Sharpe Ratio or Sortino Ratio – alongside the total number of strategies that were tested. Most importantly, it identifies the top-performing strategy, its metric score, and provides comprehensive statistics about that winning strategy’s performance. Essentially, it's a summary report of the entire comparison process.

## Interface IWalkerCallbacks

This interface provides a way to get notified about key events during the backtesting process. Think of it as a set of optional hooks you can use to observe what's happening as the framework compares different trading strategies.

You can use `onStrategyStart` to be informed when a new strategy begins its backtest, knowing the strategy’s name and the trading symbol it’s using. 

`onStrategyComplete` lets you tap into the results of each strategy’s backtest, receiving statistics and a key performance metric.

Finally, `onComplete` is triggered when all the backtests are finished, providing a consolidated view of the overall results.

## Interface IStrategyTickResultScheduled

This interface represents a tick result in the backtest-kit framework, specifically when a trading signal is scheduled and waiting for the price to reach a specified entry point. It signals that the strategy has generated a signal with a defined price target and is now passively awaiting price movement. 

The result includes details like the strategy's name, the exchange being used, the trading symbol (like BTCUSDT), and the current price at the time the signal was scheduled.  You'll also find the scheduled signal itself, which contains the parameters for when the trade should activate. This information allows you to track and understand the signals your strategies are generating and how they relate to the market conditions.

## Interface IStrategyTickResultOpened

This result signals that a new trading signal has been created. It's a notification you're getting when a signal is successfully generated and saved. 

You're given the details of the new signal, including its unique ID and all its associated data. The result also includes information about which strategy and exchange created the signal, along with the trading pair involved and the current price at the time the signal was opened. This data helps you understand the context of the new signal and track its performance.

## Interface IStrategyTickResultIdle

This interface represents what happens when your trading strategy isn't actively doing anything – it's in an idle state. Think of it as a notification that your strategy is just observing the market.

It includes details like the strategy's name, the exchange it's connected to, the trading symbol (like BTCUSDT), and the current price. The `action` property clearly indicates "idle," and the `signal` is `null` because there’s no active trading signal at this moment. This information helps you monitor your strategy’s activity and understand when it’s simply waiting for a potential trading opportunity.


## Interface IStrategyTickResultClosed

This interface describes the result you get when a trading signal is closed, providing a complete picture of what happened. It contains all the essential information about the closed signal, including the original parameters, the final price at which it closed, and the reason for the closure – whether it was due to a time limit expiring, reaching a take-profit target, or triggering a stop-loss.

You'll also find detailed profit and loss data included, accounting for fees and slippage, alongside the strategy and exchange names for easy tracking. Finally, the trading symbol is specified to ensure clarity about the asset being traded. Essentially, this interface gives you a full account of a closed trading signal, helping you analyze performance and understand the events that led to the closure.

## Interface IStrategyTickResultCancelled

This interface describes what happens when a scheduled trading signal is cancelled – it's like the system decided not to execute the signal. This might happen because the signal wasn’t triggered, or it was stopped before a trade could actually open.

The data includes the original signal that was cancelled, the price at the time of cancellation, and when the cancellation happened. You’ll also find information about which strategy and exchange were involved, as well as the trading symbol. Essentially, it gives you a record of why a signal didn't result in a trade.


## Interface IStrategyTickResultActive

This interface, `IStrategyTickResultActive`, represents a trading scenario where a strategy is actively monitoring a signal, awaiting either a Take Profit (TP), Stop Loss (SL) trigger, or a time expiration. Think of it as the system's way of saying, "We're watching this trade and waiting for something to happen."

It carries essential information about the situation, like which signal is being tracked (`signal`), the current price used for monitoring (`currentPrice`), and details about the strategy (`strategyName`), exchange (`exchangeName`), and trading pair (`symbol`) involved. It also includes a discriminator, `action`, that confirms this is indeed an "active" monitoring state.

## Interface IStrategySchema

This interface, `IStrategySchema`, describes how you define a trading strategy within the backtest-kit framework. Think of it as the blueprint for your automated trading logic.

Each strategy gets a unique name to identify it. You can also add a note for yourself or other developers to explain what the strategy does.

The `interval` property controls how often your strategy can generate signals, preventing it from overwhelming the system.

The core of the strategy is the `getSignal` function. This is where your trading logic resides, taking a symbol (like AAPL) and returning a signal – or nothing if no trade is warranted.  You can make signals "scheduled" by providing an `priceOpen`, which means the strategy waits for the price to reach a certain level before executing.

You can also specify optional callbacks for events like when a trade opens or closes, giving you more control.  Finally, you can assign a risk profile to the strategy for risk management purposes.

## Interface IStrategyPnL

This interface, `IStrategyPnL`, represents the result of a profit and loss calculation for a trading strategy. It helps you understand how your strategy performed by providing key figures. 

The `pnlPercentage` property tells you the profit or loss as a percentage, making it easy to compare performance across different strategies or time periods.  You'll also find the `priceOpen`, which shows the actual entry price used for the trade, after accounting for small fees and slippage – that's the price the strategy effectively paid. Similarly, `priceClose` represents the final exit price, again adjusted for those same fees and slippage, reflecting what the strategy truly received.

## Interface IStrategyCallbacks

This interface defines optional callback functions that your trading strategy can use to react to different signal lifecycle events. Think of them as hooks that let your strategy respond to changes in the trading environment. 

You can use `onTick` to react to every price update. `onOpen` is triggered when a new signal is validated and ready to be acted upon. The `onActive` callback lets you respond when a signal is actively being monitored.  `onIdle` is called when there aren't any active signals, indicating a period of inactivity. 

When a signal is completed, `onClose` will notify you with the final closing price. If you're using scheduled signals (delayed entries), `onSchedule` fires when a scheduled signal is created, and `onCancel` is called if a scheduled signal is cancelled before a position is opened. Finally, `onWrite` provides a way to receive notifications when signal data is being stored, which is helpful for testing purposes.

## Interface IStrategy

The `IStrategy` interface lays out the essential functions any trading strategy built with backtest-kit needs to have.

The `tick` method is the heart of strategy execution, handling each new price update. It checks for opportunities to enter a trade, monitors existing trades for take-profit or stop-loss triggers, and keeps things running smoothly.

`getPendingSignal` lets you peek at any trade signals that are currently active, allowing you to see how they're tracking. It helps in understanding the strategy’s ongoing behavior.

You can use `backtest` to quickly test your strategy on historical data, checking how it would have performed. This allows for rapid prototyping and evaluation.

Finally, `stop` provides a way to pause the strategy from generating new signals, while still letting any existing trades run to completion. This is useful for controlled shutdowns and managing live trading scenarios.

## Interface ISizingSchemaKelly

This interface defines how to size your trades using the Kelly Criterion, a method focused on maximizing long-term growth. When implementing this, you’re telling the backtest-kit framework that you want your trade sizes calculated based on the Kelly Criterion formula. 

The `method` property confirms that you’re using the Kelly Criterion. The `kellyMultiplier` property determines how aggressively you’re applying the Kelly Criterion – a smaller number (like the default 0.25) represents a more conservative approach, while larger numbers increase the potential for gains, but also higher risk. Think of it as a percentage of your capital to bet based on your calculated edge.

## Interface ISizingSchemaFixedPercentage

This schema defines a simple way to determine your trade size – by consistently risking a fixed percentage of your capital on each trade. You specify that percentage, represented by the `riskPercentage` property, as a number between 0 and 100. The `method` property is hardcoded to "fixed-percentage," indicating this is how the sizing will be calculated. It's a straightforward approach when you want consistent risk exposure on every trade.

## Interface ISizingSchemaBase

This interface, `ISizingSchemaBase`, acts as the foundation for how your trading strategies determine position sizes. It defines the core elements of a sizing configuration.

Each sizing schema gets a unique `sizingName` to identify it. You can also add a `note` to describe the sizing strategy for clarity. 

The interface includes controls for position sizing: `maxPositionPercentage` limits the size as a percentage of your account, while `minPositionSize` and `maxPositionSize` set absolute limits. Finally, you can provide optional `callbacks` to hook into different stages of the sizing process.

## Interface ISizingSchemaATR

This schema defines how to size your trades using the Average True Range (ATR). It's a way to dynamically adjust your position size based on market volatility, as measured by the ATR.

You specify this schema by setting the `method` to "atr-based," then defining `riskPercentage` which is the percentage of your capital you're willing to risk on each trade – typically between 0 and 100.  The `atrMultiplier` determines how much the ATR value is multiplied to calculate the stop-loss distance, essentially influencing how far your stop-loss is placed from the entry price. A higher multiplier means a wider stop-loss.

## Interface ISizingParamsKelly

This interface defines how to set up your trade sizing using the Kelly Criterion within the backtest-kit framework. It primarily focuses on providing a way to log debugging information related to your sizing calculations. The `logger` property lets you connect a logging service to monitor and understand how your Kelly Criterion parameters are influencing trade sizes during backtesting, making it easier to troubleshoot and optimize your strategy.

## Interface ISizingParamsFixedPercentage

This interface, `ISizingParamsFixedPercentage`, helps you define how much of your capital you're going to use for each trade when using a fixed percentage sizing strategy. It’s designed for the `ClientSizing` framework. 

You're essentially telling the system what percentage of your portfolio you want to risk on each trade. The `logger` property lets you connect a logging service to monitor the sizing calculations and troubleshoot any issues. Think of the logger as a way to keep an eye on what’s happening under the hood during trade sizing.

## Interface ISizingParamsATR

This interface, `ISizingParamsATR`, helps you define how much to trade based on the Average True Range (ATR) indicator. It's used when you're setting up your trading strategy's sizing logic.

The key part is the `logger` property. This lets you connect a logging service, which is super useful for debugging and understanding why your strategy is making the trades it is. You can use this logger to track sizing decisions and troubleshoot any issues.

## Interface ISizingCallbacks

The `ISizingCallbacks` interface provides a way to tap into the position sizing process within the backtest-kit framework. You can use it to observe and potentially influence how much of your asset you're buying or selling. Specifically, the `onCalculate` callback is triggered immediately after the framework determines the size of a trade. This is a great opportunity to check if the calculated size makes sense for your strategy, perhaps to log the size and parameters used, or to ensure it falls within acceptable limits.

## Interface ISizingCalculateParamsKelly

This interface defines the information needed to calculate trade sizing using the Kelly Criterion. To use it, you're essentially providing details about your trading strategy's performance. You'll specify the calculation method – in this case, it's “kelly-criterion” – along with your strategy’s win rate, represented as a value between 0 and 1, and the average ratio of your winning trades to your losing trades. These values together allow the framework to determine an optimal bet size based on the Kelly Criterion formula.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the information needed to calculate trade size using a fixed percentage approach. It requires you to specify the method used, which must be "fixed-percentage".  You also need to provide a `priceStopLoss` value, which represents the price at which a stop-loss order will be triggered. This value is crucial for determining the size of the trade based on the percentage risk you're comfortable with at that stop-loss level.

## Interface ISizingCalculateParamsBase

This interface defines the basic information needed to figure out how much of an asset to trade. It includes the trading symbol, like "BTCUSDT," so the framework knows what you're buying or selling. You’ll also find the current balance of your trading account, and the price at which you’re planning to enter the trade. Think of these as the essential details needed to calculate the size of your position.

## Interface ISizingCalculateParamsATR

This interface defines the information needed when calculating trade size using the ATR (Average True Range) method. It essentially specifies that the sizing should be based on ATR and provides the current ATR value to use in the calculation. Think of it as telling the system, "I want to size my trades using the ATR, and here's what the ATR currently is." It’s a straightforward way to incorporate volatility, measured by ATR, into your trade sizing strategy.

## Interface ISizing

The `ISizing` interface helps your trading strategy determine how much of an asset to buy or sell. It's the engine that figures out your position size based on your risk management rules. 

Specifically, the `calculate` property is the core of this interface; it's a function you'll implement to define your sizing logic. This function takes parameters detailing your risk profile and returns a number representing the desired position size. Think of it as the place where you put your rules for how much to trade based on factors like your account balance and risk tolerance.

## Interface ISignalRow

This interface, `ISignalRow`, represents a complete trading signal after it's been validated and is ready to be used within the backtest-kit framework. Think of it as a container holding all the essential information about a trading opportunity. 

Each signal gets a unique ID, which is automatically created to keep everything organized. You’ll also find the entry price, the exchange to use, the strategy that generated the signal, and a timestamp indicating when the signal was initially created. 

Crucially, it includes a 'pendingAt' timestamp, showing when the position was activated at the specified entry price. The symbol, like "BTCUSDT," identifies the trading pair. An internal flag, `_isScheduled`, helps the system track whether the signal was scheduled.


## Interface ISignalDto

This interface defines the structure of a signal used within the backtest kit. Think of it as a blueprint for communicating trade instructions. When creating a signal, you'll provide details like whether it's a "long" (buy) or "short" (sell) position, a brief explanation of why you're taking the trade, and the intended entry price. 

You also specify the target take profit and stop-loss prices to manage potential gains and losses. It’s important that your take profit is set higher than the entry price for long positions, and lower for short positions, and similarly for your stop-loss.  Finally, you’ll estimate how long you expect the signal to be active before it expires. The system will automatically assign a unique ID to each signal it processes.

## Interface IScheduledSignalRow

The `IScheduledSignalRow` interface represents a trading signal that's designed to be executed when the price hits a specific level. Think of it as a signal on hold – it's waiting for the market to reach a certain price before it's actually triggered. It builds upon the basic `ISignalRow`, adding the concept of a price target.

Initially, the `pendingAt` timestamp reflects when the signal was scheduled. Once the price reaches the specified `priceOpen`, the pending signal is activated, and the `pendingAt` is updated to the actual time of activation. This allows you to set up signals that react to price levels, not just current market conditions.

## Interface IRiskValidationPayload

This data structure helps risk management functions understand the current state of your trading portfolio. It provides information about how many positions are currently open and a detailed list of those active positions, including specifics like symbol, size, and entry details. Think of it as a snapshot of your portfolio's active holdings that's passed along for risk assessment. It builds upon the `IRiskCheckArgs` to add this essential portfolio context.

## Interface IRiskValidationFn

This describes a function that helps ensure your trading strategies are set up safely. Think of it as a safety check – it examines the risk parameters you’re using (like how much you’re risking per trade) and makes sure they're within acceptable limits. If something looks off, this function will raise an error, preventing potentially dangerous trades from happening. It's a core part of making sure your backtesting and live trading are controlled and reliable.

## Interface IRiskValidation

This interface, `IRiskValidation`, helps you define rules to check if your trading strategies are behaving responsibly during backtesting. Think of it as setting up safety checks to prevent unrealistic or potentially harmful scenarios. 

It has two main parts: a `validate` function, which is where you put the actual logic to perform the risk check, and an optional `note` field to explain what that validation is doing and why it's important. This note is valuable for explaining your risk management strategy to others or for your future self.

## Interface IRiskSchema

This interface, `IRiskSchema`, is your blueprint for defining how risk is managed within a portfolio. Think of it as a way to create custom rules that ensure your trading strategy stays within acceptable boundaries. 

You'll use it to register risk profiles, giving each one a unique identifier and a helpful note to explain its purpose.  It allows you to attach optional callbacks for specific events, like when a trade is rejected or allowed. The heart of the schema lies in the `validations` array, where you’ll add your own functions or pre-defined validation objects that define the risk logic itself. Essentially, this lets you tailor risk control to the specific needs of your trading strategies.

## Interface IRiskParams

The `IRiskParams` interface defines the information needed to set up the risk management part of your backtesting system. Think of it as a configuration object that tells the risk management component how to operate. It requires a logger, which is a tool for displaying helpful messages during the backtesting process to help you understand what's happening. You'll provide an instance of a logger that allows you to see debug information and potential issues.

## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, provides the essential data needed to assess whether a new trade should be allowed. Think of it as a safety check performed *before* a trading signal is generated. It collects information from the client strategy’s context, ensuring conditions are appropriate for opening a new position. 

The data includes the trading symbol (like "BTCUSDT"), the name of the strategy making the request, the exchange being used, the current price, and a timestamp indicating when this check is happening. It's all about having the right information readily available to determine if a trade is justifiable.

## Interface IRiskCallbacks

The `IRiskCallbacks` interface lets you customize how your backtest-kit trading framework reacts to risk assessments. Think of it as a way to be notified about what’s happening with your risk management.

If a trading signal is blocked because it exceeds your defined risk limits, the `onRejected` callback will be triggered, giving you a chance to log the event or take other actions. Conversely, when a signal successfully passes all the risk checks, the `onAllowed` callback will let you know.

Both callbacks provide information about the symbol being evaluated and the parameters used during the risk check, allowing for detailed tracking and analysis of your risk management process. You can use these notifications to monitor risk exposure or debug potential issues.

## Interface IRiskActivePosition

This interface, `IRiskActivePosition`, represents a single trading position that's being monitored for risk analysis across different strategies. Think of it as a snapshot of a trade, providing key information about it. It tells you which strategy initiated the trade, which exchange it was placed on, and exactly when the position was opened. You're also able to access the signal details associated with the trade, providing context for the decision-making process. This allows for a comprehensive understanding of risk exposure across various strategies.

## Interface IRisk

The `IRisk` interface helps manage and control the risk associated with your trading strategies. Think of it as a safety net for your positions.

It provides a way to check if a trading signal should be executed, considering pre-defined risk limits. 

You can register when a new position is opened, letting the framework keep track of your exposure. 

Similarly, you register when a position is closed to update the risk calculations and ensure accurate tracking. This helps maintain a balanced and controlled trading environment.

## Interface IPositionSizeKellyParams

This interface defines the parameters needed to calculate a position size using the Kelly Criterion. It helps you determine how much of your capital to allocate to a trade based on your expected win rate and the average size of your wins compared to your losses. You'll provide a `winRate`, which represents the percentage of times you expect to be profitable, and a `winLossRatio`, signifying the average return you expect for each winning trade relative to your losses. These values help backtest-kit automatically adjust your trade sizes to optimize for long-term growth.

## Interface IPositionSizeFixedPercentageParams

This interface defines the settings you'll use when calculating your position size using a fixed percentage of your capital. It’s primarily focused on specifying a stop-loss price. 

You’re telling the backtest kit where your stop-loss should be placed relative to the asset's price to help manage risk. Essentially, you provide a number representing that stop-loss price and the system will use it in its calculations.

## Interface IPositionSizeATRParams

This interface, `IPositionSizeATRParams`, holds the necessary information to calculate position sizes using the Average True Range (ATR) method. Specifically, it contains a single property: `atr`, which represents the current ATR value to be used in the sizing calculation. Think of it as providing the ATR data needed to determine how much of an asset you should trade.

## Interface IPersistBase

This interface defines the basic operations for managing data persistence, like saving and loading information. It provides a foundation for how backtest-kit stores and retrieves data. 

You can use `waitForInit` to set up the storage area initially and confirm it's ready. `readValue` lets you retrieve a specific piece of data identified by an ID. If you just need to know if a piece of data exists, `hasValue` quickly checks for its presence. Finally, `writeValue` is used to save data to the storage, ensuring the process is reliable and prevents data corruption.

## Interface IMethodContext

This interface, `IMethodContext`, provides crucial information about the current trading environment. Think of it as a little package of context passed around to make sure the right components – your trading strategy, the exchange you're interacting with, and the timeframe you're operating on – are used correctly. It carries the names of these components, specifically the exchange, the strategy, and the frame.  If you're running a live trading session, the frame name will be empty. Essentially, it ensures everything is aligned for consistent and accurate trading operations.

## Interface ILogger

The `ILogger` interface defines how different parts of the backtest-kit framework communicate about what's happening. It provides a way to record messages, helping you understand and debug your trading strategies.

You can use `log` for important events like agent executions or storage changes. `debug` is for very detailed information you might need while developing or troubleshooting, things like intermediate steps in a tool call.  `info` messages let you keep track of successful actions and overall system behavior. Finally, `warn` is for situations that aren't necessarily errors, but might indicate a potential problem you should investigate.



Essentially, this interface gives you the tools to build a record of what your trading system is doing, enabling better monitoring and easier troubleshooting.

## Interface IHeatmapStatistics

This interface describes the data you get when analyzing your portfolio's performance using a heatmap. It gives you a high-level overview of how all your investments are doing together. 

You'll find an array detailing the statistics for each individual symbol you're tracking. Alongside that, you get the total number of symbols included, the overall profit and loss (PNL) for the entire portfolio, a Sharpe Ratio to gauge risk-adjusted returns, and the total number of trades executed across all your holdings. Essentially, it's a single package containing key performance indicators for your whole investment strategy.

## Interface IHeatmapRow

This interface represents the performance data for a single trading symbol within your backtest results. It consolidates key metrics from all strategies applied to that symbol, giving you a clear picture of its overall profitability and risk profile. 

You'll find essential figures like total profit or loss, the Sharpe Ratio for risk-adjusted returns, and the maximum drawdown to understand potential downside risk. Other details include the total number of trades, win/loss counts, average profit and loss per trade, and even streaks of consecutive wins or losses. Essentially, it bundles the core performance indicators for a trading symbol into one convenient object.

## Interface IFrameSchema

This `IFrameSchema` acts as a blueprint for defining specific periods and frequencies within your backtesting simulations. Think of it as setting the stage for your trading strategy – you specify a unique name to identify it, and you can add a note for your own records.

Most importantly, you’re defining the time frame: the `startDate` and `endDate` tell the system when the backtest will run, and the `interval` dictates how frequently data points will be generated within that period. Finally, you have the option to attach specific functions (`callbacks`) to be executed at different points during the frame's lifecycle, allowing for customized behavior.


## Interface IFrameParams

The `IFrameParams` interface defines the information needed when setting up a trading environment within backtest-kit. Think of it as the initial configuration you provide. It builds upon the `IFrameSchema` and crucially includes a `logger`.  The `logger` property is your tool for observing what's happening under the hood – it lets you see debug messages and track the framework's internal workings as it executes your trading logic. Essentially, it’s how you peek into the system's operations.

## Interface IFrameCallbacks

This section describes the `IFrameCallbacks` interface, which helps you hook into different stages of how backtest-kit generates the time periods it uses for testing. 

Think of it as a way to be notified and potentially adjust things as the framework builds the timeline for your backtesting. Specifically, the `onTimeframe` property allows you to be called whenever the timeframe array is created. You can use this to check if the timeframes look right, or to simply log some information about them. It provides the timeframe array, the start and end dates, and the interval used for creating those timeframes.

## Interface IFrame

The `IFrame` interface is a core piece of backtest-kit, quietly handling the creation of timeframes needed to run your trading simulations. Think of it as the engine that produces the dates and times your backtest will analyze.

Specifically, the `getTimeframe` function is the main tool you'll see used internally. It takes a trading symbol (like "BTCUSDT") and a frame name (like "1h" for hourly) and returns a promise that resolves to an array of timestamps. These timestamps represent the points in time your backtest will evaluate. The spacing between these timestamps is determined by the timeframe settings you're using.

## Interface IExecutionContext

The `IExecutionContext` interface provides essential information available during strategy execution and exchange interactions. Think of it as a package of runtime details passed along to help your code know what's happening. It includes the trading symbol, like "BTCUSDT," the current timestamp, and a flag indicating whether the code is running a backtest or a live trade. This context is automatically provided to functions like fetching candles or handling ticks, so you don't have to pass it around manually.

## Interface IExchangeSchema

This interface describes how backtest-kit connects to different trading platforms or data sources. Think of it as a blueprint for telling the framework where to get historical price data and how to interpret trade quantities and prices.

Each exchange you want to use needs to be registered with the framework using this schema.  The `exchangeName` provides a unique identifier for that exchange within the system.  You can add a `note` to provide some extra context for other developers.

The crucial part is `getCandles`, which defines how the framework retrieves historical price data (candles) for a specific trading pair and time period.  It’s responsible for querying an API or database and returning the data in a standardized format.  

`formatQuantity` and `formatPrice` handle the complexities of different exchanges having different rules for how trades are sized and priced; they ensure everything is handled correctly. 

Finally, `callbacks` allows you to hook into certain events, like when new candle data arrives.

## Interface IExchangeParams

This interface, `IExchangeParams`, is how you set up the environment for your trading simulations when creating an `ClientExchange`. Think of it as the foundational information the exchange needs to operate correctly. 

It requires a `logger` which is crucial for keeping track of what's happening during your backtests – useful for debugging and understanding your strategy's performance.  You also need to provide an `execution` context. This context tells the exchange which assets it's trading, the current time, and whether it's running in backtest mode. Providing this context is vital for accurate simulations.

## Interface IExchangeCallbacks

The `IExchangeCallbacks` interface lets you hook into events happening when your backtest kit is pulling data from an exchange. Specifically, you can provide a function that gets called whenever the kit retrieves candle data. This function receives details about the symbol, the timeframe of the candles (like 1 minute or 1 day), the starting date and number of candles requested, and finally, the actual candle data itself. It's a way to react to incoming data as it arrives during your backtesting process.

## Interface IExchange

The `IExchange` interface defines how backtest-kit interacts with a simulated exchange. It provides functions to retrieve historical and future candle data, which is essential for recreating market conditions during a backtest. 

You can use `getCandles` to pull past price data and `getNextCandles` to simulate future data for testing purposes. 

The interface also helps with order placement by providing `formatQuantity` and `formatPrice` – these functions ensure the quantities and prices you submit are correctly formatted for the specific exchange you’re simulating. 

Finally, `getAveragePrice` calculates the Volume Weighted Average Price (VWAP) based on recent price action, which can be useful for certain trading strategies.

## Interface IEntity

This interface, `IEntity`, serves as the foundation for all data objects that are stored within the backtest-kit framework. Think of it as a contract – any object designed to be saved or retrieved from a database or persistent storage should implement this interface. It ensures a consistent structure for managing and interacting with your trading data. Essentially, it’s a common starting point for building your data model.

## Interface ICandleData

The `ICandleData` interface represents a single candlestick, which is a standard way to visualize price movements over time. It holds all the key information for a specific time interval – the time the candle began (`timestamp`), the price when it opened (`open`), the highest price reached (`high`), the lowest price seen (`low`), the price at which it closed (`close`), and the total trading volume (`volume`) during that time. This data is essential for tasks like calculating VWAP and running backtests to evaluate trading strategies.

## Interface DoneContract

This interface tells you when a background task, whether it’s a backtest or a live trading execution, has finished running. 

It provides key details about the completed process, like which exchange was used and the name of the trading strategy that ran. 

You’ll also find out if the task was a backtest (simulated trading) or a live trade, and the symbol being traded, such as "BTCUSDT". Think of it as a notification letting you know a job is done and giving you important context about it.

## Interface BacktestStatistics

This interface holds all the key statistical information generated during a backtest. Think of it as a comprehensive report card for your trading strategy.

It breaks down the results into several categories, including the details of each individual trade in the `signalList`. You'll find basic counts like total trades, wins, and losses.

More advanced metrics are also provided, such as win rate, average profit per trade, and overall cumulative profit. Risk metrics like standard deviation (volatility) and Sharpe Ratio are included to assess risk-adjusted performance. The certainty ratio highlights the ratio of average winning trades to the absolute value of average losing trades. Finally, it estimates expected yearly returns based on your backtest data. All numeric values are withheld if a calculation is unreliable.
