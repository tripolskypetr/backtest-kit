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

This function lets you plug in your own logging system to backtest-kit. It’s great if you want to send log messages to a specific location, format them in a particular way, or integrate with your existing logging infrastructure. When you provide a logger, the framework will automatically include useful information like the strategy name, exchange, and trading symbol alongside each log message. This makes debugging and monitoring your backtesting process much easier. The logger you provide must adhere to the `ILogger` interface.

## Function setConfig

This function lets you adjust how the backtest-kit framework operates. Think of it as fine-tuning the environment for your trading strategies. You can use it to change various settings, overriding the default values that come with the framework. It accepts a configuration object, but you don't need to provide every setting – only the ones you want to modify. The changes you make are applied globally, affecting all your backtests.

## Function listWalkers

This function lets you see all the different "walkers" currently set up in your backtest-kit environment. Think of walkers as specialized components that analyze and process data during your trading simulations. It provides a simple way to get a list of these walkers, which can be helpful if you're trying to understand how your system is configured, create documentation, or build tools that adapt to your walkers. The function returns a promise that resolves to an array of walker schema objects, giving you the details of each one.

## Function listStrategies

This function provides a way to see all the trading strategies currently set up in your backtest-kit environment. It returns a list of strategy descriptions, letting you easily inspect what strategies are available. Think of it as a directory listing for your trading algorithms – it’s helpful for checking configurations or building tools that need to know about all the strategies you’re using. This function is especially useful when you’re setting up or troubleshooting your trading system.

## Function listSizings

This function lets you see all the sizing configurations currently in use within your backtest setup. It’s like getting a complete inventory of how your trades are sized. You can use this to check what sizing methods are active, inspect their parameters, or even use the information to create tools that automatically display sizing details. It returns a list of sizing schemas, allowing you to examine each one in detail.

## Function listRisks

This function lets you see all the risk assessments your backtest kit is set up to handle. Think of it as a way to get a complete inventory of the potential risks the system considers.  It returns a list of these risk configurations, which you can use to understand how the backtest is evaluating different scenarios, or even to build tools that react to these risks. Essentially, it gives you a peek under the hood to see what kinds of risks are being accounted for.

## Function listOptimizers

This function helps you discover the optimization strategies currently available within your backtest-kit setup. It fetches a list of all optimizers that have been registered, providing information about each one. Think of it as a way to see what optimization options you have at your disposal. You can use this to understand your system's configuration, generate documentation, or even build interfaces that adapt to the available optimizers.

## Function listFrames

This function lets you see all the different "frames" – think of them as structured data containers – that your backtest kit is using. It's like getting a complete inventory of all the data layouts available for your trading strategies. You can use this to check what's going on under the hood, create helpful documentation, or even build interfaces that adapt to the data being used. It returns a list of schema objects, each describing a specific frame.

## Function listExchanges

This function lets you see a complete list of all the exchanges your backtest-kit environment is set up to use. It’s like a directory of all the trading venues your system knows about. You can use this to confirm your exchanges are correctly configured, generate documentation, or create flexible user interfaces that adapt to the available exchanges. The function returns a promise that resolves to an array, where each item in the array describes an exchange.

## Function listenWalkerOnce

This function lets you watch for specific events happening during a backtest, but only once. You provide a filter – a rule that defines which events you're interested in – and a function to run when a matching event occurs. Once that event is found and the function runs, the listener automatically stops watching, making it perfect for situations where you need to react to something happening just one time. It's like setting a temporary alert that disappears after it goes off. 

The first argument is the filter, telling the function exactly what kind of event to look for. The second argument is the action – what your code should do when that matching event is found.

## Function listenWalkerComplete

This function lets you be notified when the backtest-kit has finished running all its tests. It’s like setting up a listener that waits for the entire process to complete. When the tests are done, it will call a function you provide. Importantly, even if your function needs to do some asynchronous work, the backtest-kit will handle it carefully to avoid running things at the same time, ensuring everything happens in the order it's received. The function you provide receives an object containing the results of the entire testing process. It returns a function that you can call to unsubscribe from these completion notifications.

## Function listenWalker

This function lets you keep an eye on how your backtest is progressing. It’s like setting up a listener that gets notified after each strategy finishes running within a `Walker`.  The listener function you provide will be called with information about the completed strategy.  Crucially, these notifications happen one at a time, even if your listener function takes some time to process the information, which helps prevent things from getting out of sync.  It gives you a reliable way to track the overall backtest flow and react to each strategy's outcome.

## Function listenValidation

This function lets you keep an eye on potential problems during the risk validation process. Whenever a validation check fails and throws an error, this function will notify you. It's really helpful for spotting and fixing issues that might arise during your backtesting. The errors are reported one at a time, ensuring that you handle them in the order they occur, even if your error handling code itself takes some time to run. You provide a function that will be called when an error happens, and this function will return another function which is used to unsubscribe from the validation error stream.

## Function listenSignalOnce

This function lets you temporarily listen for specific trading signals. You provide a filter that defines which signals you're interested in, and a callback function that will run once a matching signal arrives. After that single execution, the function automatically stops listening, making it perfect for situations where you need to react to a signal just once and then move on. Think of it as setting up a temporary alert for a particular market condition. It handles the subscription and unsubscription for you, keeping things clean and simple.

## Function listenSignalLiveOnce

This function lets you briefly tune into the live trading signals generated by your backtest, but only to catch a single event that matches your specific criteria. Think of it as setting a temporary trap for a particular signal. 

You provide a filter – a way to specify exactly what kind of signal you're looking for – and a function that will be executed once that signal arrives. Once that single event is processed, the subscription automatically ends, so you don’t have to worry about cleaning up. This is useful for quickly observing specific signal behaviors without long-term subscriptions. The function returns an unsubscribe function if needed.


## Function listenSignalLive

This function lets you hook into a live trading simulation and receive updates as they happen. Think of it as setting up a listener that gets notified whenever a new signal is generated during a live run.  It's specifically designed to work with executions started by `Live.run()`. Importantly, the updates you receive will be processed one at a time, ensuring they arrive in the order they were generated, making it reliable for reacting to live events. To use it, you provide a function that will be called with each signal event – that function will receive an object containing details about the signal. When you’ve finished listening, the function returns another function you can call to unsubscribe.


## Function listenSignalBacktestOnce

This function lets you set up a listener that reacts to specific signals generated during a backtest. You provide a filter—a way to identify the exact type of signal you're interested in—and a callback function that will run when a matching signal arrives. Importantly, this listener is temporary; it will only execute your callback once and then automatically stop listening. It's perfect for quickly reacting to a particular event during a backtest without needing to manage ongoing subscriptions.


## Function listenSignalBacktest

This function lets you tap into the backtest process and receive updates as they happen. It’s like setting up a listener that gets notified whenever a signal is generated during a backtest run. 

You provide a function that will be called for each signal, and that function will receive data about the signal. Keep in mind these signals will only come from a `Backtest.run()` execution, and they’re delivered one at a time, ensuring the order of events is preserved. The function you provide will be returned, allowing you to unsubscribe from the signal stream when you’re done.

## Function listenSignal

This function lets you easily keep track of what’s happening in your trading strategy. It acts like a listener, notifying you whenever there's a signal—like when a position is opened, active, or closed.  The cool part is that these notifications are handled one at a time, even if the code you provide to handle them takes some time to run. This ensures things don't get out of order or overwhelmed. You just give it a function to execute when a signal occurs, and it takes care of the rest, guaranteeing that events are processed in the order they arrive.


## Function listenPerformance

This function lets you keep an eye on how your trading strategy is performing in terms of speed and efficiency. It’s like setting up a listener that gets notified whenever a timing metric is recorded during your strategy's execution. You provide a function that will be called with these performance events, allowing you to analyze where your strategy might be slow or inefficient. Importantly, the events are handled in the order they're received, and even if your callback function takes some time to process, it won’t interrupt the flow of other events. This is helpful for identifying areas where you can optimize your code for better performance.


## Function listenError

This function lets you keep an eye on any errors that happen when tasks are running in the background, whether you're live trading or backtesting. It essentially sets up a listener that gets triggered whenever an error occurs within those background processes. The errors are handled one at a time, even if the error handling function itself needs to do some work asynchronously. Think of it as a safety net to catch and address unexpected issues happening behind the scenes. You provide a function that will be called whenever an error is detected, and this function will receive the error object as an argument.

## Function listenDoneWalkerOnce

This function lets you react to when a background task within the backtest-kit framework finishes, but only once. You provide a filter to specify which completion events you're interested in, and a function to execute when a matching event happens. Once that function runs, the listener is automatically removed, so you don't have to worry about cleaning up. It's a simple way to respond to a specific background task's completion and then move on.

You define a condition (`filterFn`) to determine which completed tasks you care about. 
Then, you provide a function (`fn`) that will be called just one time when a task meets that condition.


## Function listenDoneWalker

This function lets you be notified when a background process within the backtest-kit framework finishes. It’s a way to react to the completion of tasks that run independently.

Think of it as setting up a listener; whenever a background operation is done, the function you provide will be called.  

Importantly, even if your callback function takes some time to execute (like making an asynchronous call), the notifications will be handled one after another, ensuring things happen in the order they were triggered. It avoids issues that might arise from callbacks running simultaneously.

You provide a function (`fn`) that will be executed upon completion, and this function itself returns another function – this returned function is what you’d use to unsubscribe from the completion notifications later on.

## Function listenDoneLiveOnce

This function lets you react to when a background task finishes running within the backtest-kit framework, but with a twist – it only responds once and then stops listening. You provide a filter function to specify which completed tasks you're interested in, and then a callback function that gets executed when a matching task finishes. The subscription is automatically cancelled after the callback runs, keeping your code clean and preventing unnecessary updates. It's a simple way to handle a specific completion event and then move on.

## Function listenDoneLive

This function lets you keep track of when background tasks, specifically those started with `Live.background()`, finish running. It’s like setting up a notification system for your background processes. Whenever a background task completes, the function you provide will be called, ensuring that these completion events are handled one at a time, even if your handling code involves asynchronous operations. This guarantees orderly processing and prevents unexpected behavior from running completion logic concurrently. You pass in a function, and it returns another function that you can use to unsubscribe from these completion events when they are no longer needed.

## Function listenDoneBacktestOnce

This function lets you react to when a backtest finishes running in the background, but with a special twist: it only runs your code once. You provide a filter to specify exactly which backtest completions you’re interested in – maybe you only care about tests with certain parameters or results. Once your code runs, the subscription automatically stops, so you don't have to worry about managing it yourself. It's a simple way to perform a one-time action when a specific backtest concludes.


## Function listenDoneBacktest

This function lets you get notified when a backtest finishes running in the background. Think of it as setting up a listener that’s triggered when the backtest is done. The important thing is that even if your notification code takes some time to run (like if it's doing something asynchronously), the notifications will be handled one at a time, in the order they arrive. This ensures things happen smoothly and prevents any potential conflicts. You provide a function that will be called when the backtest is complete, and this function receives details about the finished backtest as an event object. The function you provide also returns a function that you can call to unsubscribe from these notifications whenever you want.

## Function listenBacktestProgress

This function lets you keep an eye on how your backtest is running. It's like setting up a listener that gets notified as the backtest progresses, particularly useful when you're performing background tasks. The updates you receive will be in the order they happen, and even if your callback function takes some time to process each update, the system ensures they are handled one at a time to keep things organized. You provide a function that will be called with details about the progress, and this function returns another function that you can use to unsubscribe from these updates whenever you need to.

## Function getMode

This function tells you whether the trading framework is running in backtest mode, where you're testing strategies on historical data, or in live mode, where real trades are being executed. It's a simple way to check the context of your code – are you simulating or actively trading? The function returns a promise that resolves to either "backtest" or "live".

## Function getDate

This function, `getDate`, lets you retrieve the current date within your trading strategy. It’s a simple way to know what date your code is running on. When running a backtest, it gives you the date associated with the timeframe you're analyzing. If you’re running live, it provides the actual current date and time.

## Function getCandles

This function lets you retrieve past price data, or "candles," for a specific trading pair like BTCUSDT. You tell it which trading pair you're interested in, how frequently the data should be (every minute, every hour, etc.), and how many candles you want to see.  It pulls this information directly from the exchange you've connected to. The data returned is an array containing the open, high, low, close prices, and volume for each candle within the requested timeframe.

## Function getAveragePrice

This function helps you figure out the average price of a trading pair, like BTCUSDT. It uses a method called VWAP, which considers both the price and the volume traded. Specifically, it looks at the last five minutes of trading data, calculates a "typical price" based on the high, low, and closing prices, and then uses that to determine the volume-weighted average. If there's no trading volume during that time, it just calculates a simple average of the closing prices instead. You just need to provide the symbol of the trading pair you're interested in.

## Function formatQuantity

This function helps you make sure the quantity you're using for trading is formatted correctly for the specific exchange you're connected to. It takes the trading pair symbol, like "BTCUSDT", and the raw quantity as input. It then uses the exchange’s rules to ensure the quantity has the right number of decimal places, which is crucial for successful trades. This function handles the complexities of exchange-specific formatting, so you don't have to worry about calculating it yourself.

## Function formatPrice

This function helps you display prices correctly for different trading pairs. It takes a symbol like "BTCUSDT" and a raw price value, then formats the price to match the rules of that specific exchange – ensuring the correct number of decimal places are shown. Essentially, it's a convenient way to present prices in a user-friendly format, taking into account the nuances of each trading pair. You provide the symbol and the price, and it returns a formatted string representing the price.

## Function addWalker

This function lets you add a “walker” to your backtest kit setup. Think of a walker as a special tool that runs backtests for several different trading strategies simultaneously, using the same historical data. It then compares how well each strategy performed based on a metric you define. You provide a configuration object, `walkerSchema`, to tell the walker how to operate and what to compare. Essentially, it’s a way to efficiently compare the performance of different strategies side-by-side.

## Function addStrategy

This function lets you officially add a trading strategy to the backtest-kit framework. Think of it as registering your strategy so it can be used for backtesting or live trading. When you add a strategy, the framework automatically checks it to make sure it's structured correctly and has valid data like prices and stop-loss logic. It also handles rate limiting to avoid overwhelming the system with too many signals and ensures your strategy's state can be safely saved even if something unexpected happens. You provide the framework with a configuration object that defines your strategy.

## Function addSizing

This function lets you tell backtest-kit how to determine the size of your trades. Think of it as setting up your risk management rules. You provide a configuration object that specifies the method for calculating position sizes – whether you’re using a fixed percentage, a Kelly Criterion, or something based on Average True Range (ATR). 

The configuration also lets you set limits, like minimum and maximum trade sizes, and caps on how much of your capital can be in a single trade. Plus, you can add callbacks to be notified when position sizes are being calculated. This is how you integrate your custom sizing logic into the backtesting process.

## Function addRisk

This function lets you set up how your trading framework manages risk. Think of it as defining the guardrails for your strategies. You can specify limits on how many trades can be active at once, and even create custom checks to make sure your portfolio stays healthy – things like ensuring your trades aren't too correlated or meeting certain portfolio metric requirements. The nice thing is that multiple trading strategies will share these risk settings, giving you a complete view of your overall risk exposure and allowing you to enforce rules that span across different strategies. The framework keeps track of active positions so your custom checks have the information they need to make informed decisions.

## Function addOptimizer

This function lets you register a custom optimizer within the backtest-kit framework. Think of an optimizer as a system that automatically generates trading strategies based on your defined settings. It gathers data, uses large language models to craft prompts, and then builds complete, runnable backtesting code. By providing an optimizer schema, you're essentially teaching the framework how to create these automated trading strategies. The resulting code includes all the necessary components like exchange settings, trading logic, and even integration with LLMs.

## Function addFrame

This function lets you tell backtest-kit how to create timeframes for your backtesting runs. Think of it as defining the scope and frequency of your historical data. You’re essentially setting the start and end dates of your backtest, and deciding how often you want to generate data points – maybe every minute, hour, or day. It allows you to customize the data that your trading strategies will be evaluated against.  You pass in a configuration object that describes these parameters and backtest-kit handles the generation of the timeframes.


## Function addExchange

This function lets you tell backtest-kit about a new data source for trading – an exchange. Think of it as adding a new market to your backtesting environment. You provide a configuration object that describes how to access historical price data, how to format prices and quantities, and even how to calculate indicators like VWAP.  Essentially, you’re telling the framework where to get the data it needs to run your trading strategies. The framework then uses this information to pull in the necessary data and perform calculations.


# backtest-kit classes

## Class WalkerValidationService

The WalkerValidationService helps you ensure your trading strategies, or "walkers," are set up correctly before you run them. It acts as a central place to define and check the structure of your walkers.

You can add walker schemas, which are essentially blueprints describing how a walker should be configured. The service then lets you validate that a specific walker exists and conforms to its defined schema. 

If you need to see what walkers are registered and their schemas, you can easily get a list of all defined walkers. This service is designed to catch potential errors early on, promoting more reliable backtesting.

## Class WalkerUtils

WalkerUtils helps you run and manage your trading strategy comparisons, streamlining the process with helpful shortcuts. It acts as a central hub, simplifying interactions with the underlying walker command service.

You can easily run comparisons for a specific trading symbol, providing context like the walker's name, and WalkerUtils handles the details for you. There’s also a background mode that allows you to run comparisons silently, perfect for tasks like logging or triggering callbacks without needing to see the results directly. 

Retrieving the results of past comparisons is simple with the `getData` function, and creating reports summarizing the comparisons is equally straightforward. Finally, the `dump` function lets you save those reports as files on your computer. WalkerUtils is designed to be a convenient, single point of access for many common walker operations.

## Class WalkerSchemaService

The WalkerSchemaService helps you keep track of your trading strategies, or "walkers," in a structured and organized way. Think of it as a central place to store and manage the blueprints for your trading logic.

It uses a special system to ensure the information you store for each walker is consistent and follows a predefined format.

You can add new walker blueprints using `addWalker()`, and then find them again later by their name using `get()`. If you need to make small adjustments to an existing walker's blueprint, `override()` allows you to update specific parts without replacing the whole thing.

Before a new walker blueprint is officially registered, `validateShallow()` checks to make sure it has all the necessary pieces and that they're of the correct types. This helps catch errors early and keeps your walker registry clean and reliable.

## Class WalkerMarkdownService

The WalkerMarkdownService helps you automatically create and save reports about your trading strategies. It listens for updates from your trading simulations (walkers) and keeps track of how each strategy is performing.

It generates nicely formatted markdown tables that allow you to easily compare different strategies side-by-side. These reports are saved as files, making it simple to review your simulation results.

The service uses a special storage system to keep the data organized, ensuring each walker has its own separate report. You can clear the data for a specific walker or clear all walker data if needed.

To get started, the service automatically initializes itself when you first use it, so you don’t have to worry about setting anything up.

## Class WalkerLogicPublicService

The WalkerLogicPublicService acts as a central hub for coordinating and running your trading strategies, simplifying the process of managing context. It builds upon the WalkerLogicPrivateService, automatically handling important details like which strategy is running, which exchange is being used, the timeframe of the data, and the specific walker involved. 

This means you don't need to manually pass this information around—the service takes care of it for you.

The `run` method is the primary way to use this service; it allows you to initiate a comparison of walkers for a particular asset, propagating context data along the way. Think of it as the command to start the backtesting process for all your strategies.

## Class WalkerLogicPrivateService

This service helps you compare different trading strategies against each other in a structured way. It orchestrates the backtesting process, essentially running each strategy one after another.

As each strategy finishes its backtest, you’re given updates on its progress, allowing you to monitor how things are going. The service keeps track of the best-performing strategy in real time.

Finally, it gives you a complete report at the end, showing you all the strategies ranked by performance. Internally, it relies on other services to actually run the backtests.

To use it, you provide the trading symbol, a list of strategies you want to compare, the metric you're using to judge performance (like profit or drawdown), and some context information about the environment. The `run` method then kicks off the entire comparison process.

## Class WalkerCommandService

The WalkerCommandService acts as a central hub for interacting with the walker functionality within the backtest-kit. Think of it as a convenient layer on top of the underlying logic, designed to make things easier to manage, especially when you’re using dependency injection. 

It bundles together several important services – things like logging, handling walker logic, validating strategies and exchanges, and managing schemas – so you don't have to deal with them individually.

The `run` method is the main way you’ll use this service; it allows you to execute a walker comparison for a specific trading symbol, while providing important details like the walker's name, the exchange it’s using, and the frame it’s operating within. This method returns a generator, which means you can process the results step-by-step.

## Class StrategyValidationService

This service helps ensure your trading strategies are well-defined and consistent before you run backtests. Think of it as a quality control system for your strategy code.

You can add strategy definitions, each outlining the expected structure and rules, using the `addStrategy` method. The `validate` method then checks if a specific strategy exists and if its risk profile is properly defined. 

If you need to see what strategies you've registered, use the `list` method – it returns a clear overview of all the registered strategy schemas. The `loggerService` and `riskValidationService` properties are internal components used to provide logging and risk assessment during validation.

## Class StrategySchemaService

The StrategySchemaService helps you keep track of your trading strategy definitions in a structured and type-safe way. It acts as a central place to register, store, and retrieve strategy blueprints. 

Think of it as a library where you can add new strategy designs (using `addStrategy()`) and then easily find them later by their names.  Before a strategy design is added, it's checked (`validateShallow`) to make sure it has all the necessary building blocks. 

You can also update existing strategies (`override`) with just the parts you need to change. Finally, `get` lets you quickly grab a specific strategy definition when you need it.

## Class StrategyGlobalService

This service acts as a central hub for managing and running trading strategies within the backtest kit. It's designed to work behind the scenes, integrating strategy operations with information about the market symbol, the time, and whether it's a backtest or live run.

It keeps track of strategy validation to avoid unnecessary checks, and provides ways to retrieve the current pending signal – useful for monitoring things like stop-loss and time expiration.

You can use it to check how a strategy performs at a specific time, run quick backtests against historical data, and even stop a strategy from generating new signals. It also has a way to clear out cached strategy information, forcing a fresh start when needed.

## Class StrategyConnectionService

The StrategyConnectionService acts as a central hub for managing and executing trading strategies. It intelligently routes calls to the correct strategy implementation based on the context of the request. To improve performance, it keeps a record of strategy instances, reusing them when possible.

Before you can use a strategy, make sure it's initialized.  The service handles both live trading (`tick()`) and historical backtesting (`backtest()`) operations. 

You can stop a strategy from producing new signals using the `stop()` method, and if you need to reset a strategy or free up resources, the `clear()` method will remove it from the internal record. The `getPendingSignal()` function lets you check for any active signals, which is handy for tracking stop-loss and take-profit orders.

## Class SizingValidationService

The SizingValidationService helps ensure your trading strategies use valid sizing methods. Think of it as a gatekeeper for your order sizes. 

You can register different sizing approaches, each with its own rules, using the `addSizing` function.  This allows you to define what "sizing" means for various strategies.

The `validate` function checks if a particular sizing method is defined and, optionally, confirms it's being used correctly based on the chosen method like fixed percentage or Kelly criterion.

If you need to see what sizing methods you've currently registered, the `list` function returns them as a list of schemas. Essentially, it gives you a quick view of the sizing options available to your backtesting system.

## Class SizingSchemaService

The SizingSchemaService helps you keep track of different sizing strategies for your trading backtests. It uses a system that ensures type safety when storing these sizing schemas.

You can add new sizing strategies using the `register` method, and update existing ones with `override`. To use a specific sizing strategy, you can retrieve it by name using the `get` method. 

The service also performs a basic check to ensure the structure of your sizing schema is correct before it's added to the system. This ensures that the schema has all the expected properties and the right data types.

## Class SizingGlobalService

This service helps determine how much of an asset to trade based on your defined risk rules. Think of it as the engine that figures out your position size, taking into account things like your risk tolerance and account balance. It works closely with a connection service and a validation service to ensure calculations are accurate and safe.

The core functionality lies in the `calculate` method, which accepts parameters defining the sizing request and a context to track sizing name. You can think of `calculate` as the main entry point to get a position size recommendation. 

The service also holds references to logging, sizing connection and validation services for internal management.

## Class SizingConnectionService

This service helps your trading strategy determine how much to trade, connecting specific sizing methods to your configuration. It acts as a central point for all sizing calculations, making sure the right method is used.

The service keeps track of which sizing methods have already been loaded, so it doesn't have to recreate them every time you need to calculate a position size. This speeds things up considerably.

You can request a specific sizing method by name, and it will either return a previously loaded version or create a new one.

The `calculate` method is where the actual sizing happens. It takes parameters related to the trade and the sizing method's name, and then figures out the appropriate position size, potentially using techniques like fixed percentages or Kelly Criterion. If your strategy doesn't require sizing, you'd use an empty string for the sizing name.

## Class ScheduleUtils

The ScheduleUtils class helps you monitor and report on scheduled trading signals. Think of it as a tool to keep an eye on how your automated strategies are performing in terms of signal scheduling. 

It provides easy access to data about scheduled signals, letting you see things like how many signals are in the queue, which ones were cancelled, and how long they typically wait.  You can also generate markdown reports that summarize this information for a specific strategy. 

The class is designed to be simple to use – it's available as a single instance, so you don’t need to worry about creating new objects. You can retrieve data, generate reports, and even save those reports directly to a file on your computer. This class is all about making it easier to understand and troubleshoot the timing and execution of your trading strategies.


## Class ScheduleMarkdownService

The ScheduleMarkdownService helps you keep track of your trading signals and generate easy-to-read reports. It listens for signals being scheduled and cancelled, collecting data for each strategy you're using.

Think of it as a system that automatically builds reports, detailing when signals were scheduled, when they were cancelled, and provides useful statistics like cancellation rates and average wait times. These reports are saved as markdown files, making them simple to read and share.

Each strategy gets its own dedicated report storage, ensuring data isolation. The service automatically creates the necessary directories to store these reports.  You can also clear the collected data for specific strategies or for all strategies at once.  Finally, initialization happens automatically the first time you use the service, so you don’t have to worry about setting it up manually.

## Class RiskValidationService

The RiskValidationService helps you make sure your trading strategies are managing risks properly. Think of it as a safety net for your backtesting.

You can add different types of risks to the service, defining exactly what each risk looks like using a schema. The service then lets you check if a specific risk profile exists and is correctly formatted. 

The `list` function is useful if you want to see all the risk profiles you've defined, giving you a quick overview of how your backtest is approaching risk. Essentially, it helps you define, track, and verify your risk management setup within your backtesting framework.

## Class RiskSchemaService

The RiskSchemaService helps you keep track of your risk schemas in a structured and safe way. It's like a central library for defining and managing the rules and parameters that govern your risk assessments.

It uses a special system for ensuring the schemas are of the expected types, preventing errors down the line. You can add new risk profiles using the `addRisk()` method, and easily find them again by their names using the `get()` method. 

If you need to update a risk profile, you can use the `override()` method to make changes without replacing the entire schema.  Before a new schema is added, it goes through a quick check with `validateShallow()` to make sure all the essential parts are present and in the correct format.

## Class RiskGlobalService

This service acts as a central hub for managing and validating risk limits within the backtest-kit framework. It works closely with a connection service to ensure trades adhere to predefined risk parameters. 

You're able to register when a strategy opens a position using `addSignal` and notify the system when a position is closed with `removeSignal`. It’s designed to avoid unnecessary validations by caching results. 

The `validate` function checks the risk configuration, and the `clear` function allows you to wipe risk data – either for a specific risk profile or all profiles at once. Finally, `checkSignal` decides whether a signal is permissible based on the established risk constraints.

## Class RiskConnectionService

The RiskConnectionService acts as a central hub for managing risk checks in your trading strategies. It intelligently directs risk-related operations to the correct risk management component based on a specified risk name. 

Think of it as a smart router—when you need to check if a trade is safe according to your risk rules, this service figures out which set of rules to apply. It also remembers previously used risk rules, making things faster by avoiding unnecessary re-creation. 

The service handles checks like ensuring your portfolio isn’t losing too much, that you’re not overly exposed to a single asset, and that you're not opening too many positions. You can clear the remembered risk rules if needed. Strategies without defined risk settings simply use an empty risk name.

## Class PositionSizeUtils

This class offers helpful tools for figuring out how much of an asset to trade, based on different strategies. It provides pre-built calculations for several common position sizing techniques.

You'll find methods for calculating position size using a fixed percentage of your account, the Kelly Criterion (which aims to maximize growth), and an approach based on Average True Range (ATR) to account for volatility. 

Each method takes into account factors like your account balance, the asset's price, and risk parameters. The class also ensures that the data you provide is appropriate for the chosen sizing method.

## Class PersistSignalUtils

This class helps manage how trading signals are saved and loaded, particularly for strategies running in live mode. It’s designed to keep track of signals reliably, even if things go wrong.

The system remembers signal data separately for each strategy, preventing confusion between different trading approaches. You can also customize how the data is stored using your own adapters.

To retrieve existing signal data, `readSignalData` fetches the stored information for a specific strategy and trading symbol.  If no data exists, it returns nothing. 

When you need to save a new signal, `writeSignalData` handles writing that data to disk in a way that's protected from corruption, for example, in case of a sudden crash.

Finally, `usePersistSignalAdapter` allows you to plug in your own way of saving and loading signals, making the system more flexible.

## Class PersistRiskUtils

This class, PersistRiskUtils, helps manage and save the details of your trading positions, especially when dealing with different risk profiles. It’s designed to be reliable, even if something unexpected happens during the trading process.

The class keeps track of where your position data is stored, remembering it for each risk profile. You can even customize how this data is stored using your own adapters.

The `readPositionData` function is used to load previously saved position information, and it returns an empty set of positions if nothing has been saved yet.  After you make changes to your positions, the `writePositionData` function saves those changes to disk, ensuring the saves are reliable even if there's a sudden interruption.

You can also register your own specialized persistence adapters with `usePersistRiskAdapter` if the default methods aren't quite what you need.

## Class PerformanceMarkdownService

This service helps you understand how your trading strategies are performing. It listens for performance data as your strategies run and carefully collects key metrics like average execution time, minimums, maximums, and percentiles. 

The service keeps track of performance data separately for each strategy you’re testing, ensuring you can analyze each one individually. You can request these aggregated statistics at any time to get a snapshot of a strategy's health.

It’s also capable of generating nicely formatted markdown reports detailing the performance analysis, including potential bottlenecks. These reports can be saved to disk for later review.

To keep things organized, you can clear the accumulated performance data when it's no longer needed, and the service initializes itself automatically once to start listening for performance events.

## Class Performance

The Performance class helps you understand how your trading strategies are performing. It lets you retrieve combined performance statistics for a specific strategy, giving you insights into metrics like count, duration, average time, and volatility. 

You can also generate easy-to-read markdown reports that highlight performance bottlenecks and show time distribution across different operations. These reports help pinpoint areas needing optimization.

The class allows you to save these reports directly to your computer, creating a persistent record of your strategy’s behavior. Furthermore, you can clear the stored performance data when it's no longer needed.

## Class OptimizerValidationService

This service helps ensure your optimizers are properly registered and ready to use within the backtest-kit. Think of it as a central record keeper for your optimizers, verifying they exist and keeping track of their details. 

It lets you add new optimizers to this registry, making sure you don’t accidentally register the same optimizer twice. You can also check if a particular optimizer is registered, and it does this efficiently by remembering previous checks. 

If you need to see all the optimizers that are currently registered, you can request a list of them. This helps you understand which optimizers are available for your backtesting strategies.

## Class OptimizerUtils

This set of tools helps you work with strategies created by an optimizer. 

You can retrieve strategy data, which combines information from different training periods and prepares it for use. 

It also lets you generate the actual code for your strategy, bundling everything needed to run it. 

Finally, you can easily save this generated code to a file, automatically creating any necessary folders and naming the file in a standard format.

## Class OptimizerTemplateService

The OptimizerTemplateService is a core component that builds the code snippets used for backtesting and optimization. It uses an LLM, specifically Ollama, to generate this code, allowing for features like multi-timeframe data analysis and structured signal generation. 

You can think of it as a code generator that handles many of the common pieces needed for a trading strategy, including setting up data frames (time periods), configuring exchanges (like Binance using CCXT), and creating launcher scripts to run comparisons between different strategies. It also provides helper functions for debugging, such as saving conversations and results to a specific folder.

The service provides pre-built templates for various tasks, from setting up the initial import statements and constants to defining the logic for trading signals. These signals are structured with specific fields like position, note, entry/exit prices, and estimated duration, ensuring a consistent format for your automated trading system. While comprehensive, certain aspects can be customized through configuration.

## Class OptimizerSchemaService

The OptimizerSchemaService helps you keep track of and manage the configurations for your optimizers within the backtest-kit framework. It’s like a central directory where you store and retrieve optimizer settings.

When you add a new optimizer configuration, the service makes sure it has all the necessary information, like its name, training data range, and where to get prompts. You can also update existing configurations by merging in new settings.

Need to find an optimizer's configuration? This service provides a simple way to retrieve it by its name. It utilizes a registry to securely store your schema.

## Class OptimizerGlobalService

The OptimizerGlobalService acts as a central hub for interacting with optimizers, ensuring everything runs smoothly and correctly. It’s the main way to get data, code, and save strategies.

Think of it as a gatekeeper: before any optimizer-related action happens, it logs the operation and confirms the optimizer actually exists. Then, it passes the request on to other services to do the actual work.

You can use it to fetch data from various sources and compile it into strategy metadata, or to generate complete, ready-to-run strategy code. It’s also useful for creating and saving strategy code to files, like creating a local copy of a strategy. 

It relies on other services – a logger for tracking actions, a connection service for handling the optimizer’s connections, and a validation service to make sure everything is correct – but you generally interact with this service as the starting point.

## Class OptimizerConnectionService

The OptimizerConnectionService helps you work with different optimizers without creating new connections each time. It keeps track of optimizer instances, reusing them for efficiency and speed.

Think of it as a central hub for managing your optimizers. It combines your custom settings with default configurations to ensure consistent behavior.

You can easily get an optimizer instance using `getOptimizer`, which automatically caches them based on their name.

The service also provides methods to retrieve data, generate code, and even save that code to a file, making it simple to integrate optimizers into your backtesting workflow. It handles the complexities of connecting to and using optimizers, so you can focus on your trading strategies.

## Class LoggerService

The `LoggerService` is designed to provide a consistent way to log information throughout the backtesting framework. It automatically includes helpful context like the strategy name, exchange, and frame being executed, as well as details about the symbol, time, and whether it's a backtest.

You can use the provided `log`, `debug`, `info`, and `warn` methods to record different levels of messages; these methods all handle the context injection for you. If you don’t provide your own logging implementation, it defaults to a “no-op” logger, meaning nothing gets logged.

If you want to use a specific logging library or format, you can provide your own `ILogger` implementation using the `setLogger` method. The service also manages the method and execution contexts internally via `methodContextService` and `executionContextService`, though you typically won't need to interact with them directly.

## Class LiveUtils

LiveUtils helps you manage live trading operations with a few helpful tools. It acts as a central hub for running live trading, making it easier to get started and handle unexpected issues.

The `run` function is the primary way to execute live trading; it provides an infinite stream of trading results and automatically recovers from crashes by saving and restoring state. Think of it as a continuously running engine that keeps going even if something goes wrong.

If you just need to perform actions during live trading without needing to see the results, `background` lets you run the trading process silently.

To monitor your live trading, `getData` provides statistics, and `getReport` generates a markdown report summarizing the events. Finally, `dump` allows you to save these reports directly to a file.

## Class LiveMarkdownService

The LiveMarkdownService helps you automatically create detailed reports about your live trading strategies. It watches every signal event – from when a strategy is idle to when a trade is opened, active, or closed – and keeps track of everything. 

These events are then compiled into easy-to-read markdown tables, complete with key trading statistics like win rate and average profit. The reports are automatically saved to your logs directory, making it simple to review your strategies' performance.

You can clear the stored data for a specific strategy, or clear all strategies at once. The service initializes itself automatically when needed, subscribing to live signals to start collecting data. It uses a special system to ensure it only initializes once. You're also able to use the logger service for debugging purposes.

## Class LiveLogicPublicService

This service simplifies live trading by automatically handling context information like the strategy and exchange names. It provides a straightforward way to run live trading for a specific symbol and continuously streams data about trading events—openings, closures, and cancellations—as an ongoing sequence.

You don't have to manually pass context details with each function call; the service takes care of that for you. The trading process is designed to be resilient; even if it crashes, the state is saved and can be restored. It operates continuously, keeping track of real-time progression using the current time. Essentially, it's a robust and convenient way to execute your trading strategies in a live environment.


## Class LiveLogicPrivateService

This service manages the ongoing process of live trading for a specific financial symbol. It operates continuously, acting as the engine that monitors trading signals and executes trades. Think of it as a tireless worker that keeps an eye on the market, always ready to react.

It uses a special technique, called an async generator, to deliver updates about your trades – only showing you when a trade is opened or closed, skipping the periods where nothing significant happens. This approach helps keep things efficient and avoids overwhelming you with unnecessary information.

The process is designed to be resilient; if something goes wrong and it crashes, it will automatically recover and resume trading from where it left off. It remembers its state and picks up where it stopped. 

Essentially, it’s a constantly running system that provides a stream of real-time trading results, designed for continuous operation and reliable recovery.

## Class LiveCommandService

This service gives you a straightforward way to access live trading features within the backtest-kit framework. Think of it as a central hub that manages connections to other essential components. 

It bundles together various services like logging, validation, and schema management to keep things organized and make it easier to inject dependencies.

The main thing it offers is the `run` method. This is how you kick off live trading for a specific trading symbol, while also passing along important information like the strategy and exchange names. The `run` method continuously generates results – think of it as an ongoing stream – and it’s designed to handle any unexpected errors to keep the trading process running smoothly.

## Class HeatUtils

This class helps you visualize and understand how your trading strategies are performing. It's designed to make it easy to generate and save portfolio heatmaps, which show key statistics for each asset your strategy traded.

You can use this class to get detailed data about your strategy's performance, broken down by individual assets.  The data includes metrics like total profit/loss, Sharpe ratio, maximum drawdown, and the number of trades made.

It also provides a quick way to create a nicely formatted markdown report of this data, arranged so you can easily see which assets contributed the most to your strategy's overall results.  Finally, the class lets you save these reports directly to your hard drive, making it simple to share your findings or track your progress over time. It’s conveniently available as a single instance, ready for you to use.


## Class HeatMarkdownService

The Heatmap Service helps you visualize and analyze the performance of your trading strategies. It gathers data from closed trades, allowing you to see how each strategy is doing overall, and also provides detailed breakdowns for individual assets. 

You can easily generate reports in Markdown format to share your findings or keep a record of your trading history. The service handles calculations safely, preventing errors from unexpected values. It keeps track of data separately for each strategy, making it easy to compare and manage different approaches.

To get started, the service automatically initializes when you first use it. You can also clear the accumulated data whenever you need to, either for a specific strategy or for all strategies at once. The service uses a "loggerService" to help with debugging and a "getStorage" function to organize data for each strategy. To keep the data flowing, make sure to call the `tick` method from your signal emitter subscription.

## Class FrameValidationService

This class, `FrameValidationService`, helps you keep track of the structure of your trading data frames. Think of it as a registry for your frames.

You can add frame schemas to it, essentially defining what each frame *should* look like. It lets you validate that a frame exists and conforms to its defined structure. 

You can retrieve a list of all registered frame schemas to see what frames you’ve set up. This service acts as a central place to manage and verify your frame definitions, helping ensure data consistency in your backtesting process.


## Class FrameSchemaService

The FrameSchemaService helps you keep track of the structures used in your backtesting simulations. Think of it as a central place to define and manage the blueprints for how your data is organized.

It uses a specialized storage system to ensure your schema definitions are type-safe and reliable.  You can add new schema definitions using `register`, update existing ones with `override`, and easily retrieve them later by name with `get`. The service also performs checks to ensure that your schemas have the necessary elements before they're added, making sure everything is set up correctly.

## Class FrameGlobalService

This service helps manage and generate timeframes for your backtesting scenarios. It works behind the scenes, using a connection to data and validating the timeframes to ensure they're suitable for analysis. 

Essentially, it provides a straightforward way to get arrays of dates representing specific timeframes like daily, weekly, or monthly data for a given trading symbol. Think of it as the tool that prepares the chronological data your backtesting logic will actually work with. 

It utilizes other services for connecting to data and checking the validity of timeframes. You'll likely interact with it through its `getTimeframe` method.

## Class FrameConnectionService

The FrameConnectionService acts as a central hub for managing and accessing different trading frames, like minute, hourly, or daily data. It figures out which specific frame implementation to use based on the current trading context. 

Think of it as a smart router, ensuring your requests go to the right place. It also remembers which frames it's already created, so it doesn't have to recreate them every time, which speeds things up.

This service is especially useful during backtesting, as it handles the timeframe boundaries (start and end dates) you define for your historical data.  It retrieves these dates to control how far back your backtesting runs. During live trading, the frame name is empty, meaning there are no frame constraints applied.

The service relies on other components like a logger, schema service, and method context service to function correctly. 

You can use the `getFrame` function to retrieve a specific frame, and `getTimeframe` to get the start and end dates for a backtest.

## Class ExchangeValidationService

The ExchangeValidationService helps you keep track of and verify the structure of your exchange data. It's like a librarian for your exchange schemas, ensuring they're all set up correctly. 

You can add new exchange schemas using `addExchange`, providing a name and its defining structure. `validate` checks if a specific exchange is registered and ready to use.  If you need to see what exchanges are currently being managed, `list` returns a complete list of registered exchange schemas. It helps you maintain a consistent and reliable data foundation for your trading strategies.

## Class ExchangeSchemaService

The ExchangeSchemaService helps you keep track of information about different exchanges you're working with in your trading system. Think of it as a central place to store and manage details like trading pairs, symbols, and other exchange-specific configurations.

It uses a special system to ensure that the information you store is accurate and consistent.

You can add new exchange configurations using `addExchange()`, and retrieve them later by their name using `get()`.  If you need to update an existing configuration, the `override()` method lets you make partial changes without replacing the entire configuration.  Before adding a new exchange, `validateShallow()` checks to make sure it has all the necessary information.

## Class ExchangeGlobalService

The ExchangeGlobalService acts as a central hub for interacting with exchanges, making sure that important information like the trading symbol, timestamp, and backtest settings are always available. It combines the functionality of managing exchange connections with the ability to inject this context into operations.

This service handles tasks like validating exchange configurations – it remembers previous validations to avoid repeating them unnecessarily. 

It provides methods for retrieving historical candle data, and uniquely, it allows fetching future candle data specifically for backtesting scenarios. You can also use it to calculate average prices and format price and quantity values, all while ensuring the correct context is used. This class is an internal component, frequently used by other parts of the backtesting and live trading logic.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges. It handles the complexities of connecting to each exchange by automatically routing requests to the correct implementation based on the exchange name set in the system.

To improve performance, it cleverly caches these exchange connections, so you don't have to repeatedly establish them.

You can use this service to get historical candle data, request the next set of candles based on the current timeframe, retrieve the current average price (either from a live exchange or calculated from historical data), and format prices and quantities to comply with each exchange’s specific rules. It manages the details of communicating with each exchange, letting your trading strategies focus on the logic of trading itself.


## Class ClientSizing

This component, ClientSizing, helps determine how much of your assets to allocate to a trade. It's designed to be flexible, offering several different sizing methods like fixed percentages, the Kelly Criterion, and ATR-based sizing.

You can also set limits on position sizes to ensure you're not overexposing yourself, defining both minimum and maximum sizes and setting a maximum percentage of your capital that can be used. 

It also allows for custom logic through callbacks, letting you validate calculations or log sizing decisions. The `calculate` method is the core of the component, taking in parameters and returning the calculated position size.

## Class ClientRisk

ClientRisk helps manage risk across your trading strategies, ensuring you don't exceed your defined limits. Think of it as a safety net for your portfolio.

It keeps track of all open positions, even when multiple strategies are active, giving you a holistic view of your exposure. You can set limits on the maximum number of positions you hold concurrently.

ClientRisk also allows for custom validation rules, letting you build more sophisticated risk checks that consider factors beyond simple position counts. It works closely with your strategies, examining each signal before a trade is placed to see if it’s safe to execute.

The `addSignal` and `removeSignal` methods are used to update the system when positions are opened and closed, respectively, keeping the position tracking accurate.  The `checkSignal` function is at the heart of the process, evaluating each potential trade against your rules. You don’t need to worry about how it’s integrated, it automatically validates signals.

## Class ClientOptimizer

The ClientOptimizer helps you automatically find and refine your trading strategies. It's designed to pull data from various sources, even when that data is spread across multiple pages. 

It keeps track of conversations with a language model as it explores different approaches and builds up your strategy. You can think of it as a tool that combines data gathering, code generation, and the ability to save your resulting strategy as a runnable file. It's a core component used by the OptimizerConnectionService to create and manage these automated optimization processes. 

The ClientOptimizer lets you retrieve data, generate complete trading strategy code, and export that code to a file, making the entire process smoother and more automated.

## Class ClientFrame

The `ClientFrame` is a crucial component for running backtests, responsible for creating the sequences of timestamps that define the historical periods your strategies will operate on. Think of it as the engine that feeds your backtest with the "when" of your trading decisions. 

It avoids unnecessary work by remembering previously generated timeframes, a process called singleshot caching.  You have control over the frequency of the generated timeframes – from one minute to three days – to match the granularity of your strategy. 

It also allows you to customize the timeframe generation process with callbacks for validation and logging, letting you ensure the data is accurate and track its creation.  The `getTimeframe` method is the primary way to get these timeframes, and it leverages the singleshot caching to be efficient.

## Class ClientExchange

This class handles communication with an exchange to retrieve market data and format trade information. It's designed to be a client-side implementation, efficiently accessing historical and future candle data.

You can use it to fetch historical price data for analysis, or to look ahead and get future candles – essential for backtesting strategies.  The `getNextCandles` method is specifically tailored for backtesting, allowing you to simulate trading scenarios.

It can also compute a Volume Weighted Average Price (VWAP) based on recent trades, using a configurable number of 1-minute candles. This provides insight into average prices and potential trading opportunities. Finally, it handles formatting quantities and prices to ensure they adhere to the exchange’s specific requirements, making it ready for order placement.

## Class BacktestUtils

This class provides handy tools to manage and analyze your backtesting runs. Think of it as a helper for running tests and getting insights into how your trading strategies performed.

You can easily kick off a backtest for a specific trading symbol and it will handle the complexities of running it and logging the results for you. There’s also a way to run backtests in the background – perfect if you just want to trigger something without needing to see the detailed results as they come in.

Need to see how a strategy did overall? You can pull back statistical data or generate a nicely formatted markdown report outlining the performance of your strategies. Finally, it's simple to save these reports directly to your computer’s file system.

## Class BacktestMarkdownService

The BacktestMarkdownService helps you create and save reports detailing your backtesting results. It works by listening for trading signals during a backtest and carefully tracking the results of closed trades for each strategy you're testing.

It keeps a separate record for each strategy, ensuring that data remains isolated and organized. You can request statistical data, generate a nicely formatted markdown report with trade information, or save the report directly to a file. 

The service handles the file saving automatically, creating the necessary directories if they don’t exist. It also has a way to clear out the accumulated data for individual strategies or for all strategies at once. The initialization process is automatic, ensuring it’s ready when you need it.

## Class BacktestLogicPublicService

This service helps you orchestrate backtesting processes, making it easier to run simulations for your trading strategies. It handles the behind-the-scenes details of managing the context – like the strategy name, exchange, and timeframe – so you don't have to pass it around explicitly in every function call. Think of it as providing a consistent environment for your backtesting.

The `run` method is the core of this service.  It lets you execute a backtest for a specific trading symbol and returns results as a stream. The stream delivers data about the backtest results step-by-step, and crucially, the context is automatically included in all the calculations performed during the process.


## Class BacktestLogicPrivateService

The `BacktestLogicPrivateService` helps orchestrate backtesting processes in a memory-friendly way. It works by getting timeframes, processing ticks, and then reacting to trading signals. When a signal tells the system to open a trade, it fetches the necessary historical data and runs the backtest logic.

The system efficiently streams results, avoiding the need to store everything in memory at once. It allows for stopping the backtest early if needed, giving you more control. 

You can think of it as a pipeline – you provide a symbol, and it generates a stream of results representing the closed trades. It relies on several other services like the frame service and exchange service to fetch the data and perform calculations.

## Class BacktestCommandService

The BacktestCommandService acts as a central hub for initiating and managing backtesting operations within the framework. Think of it as a helpful assistant that simplifies accessing backtesting capabilities and makes it easy to integrate them into your application. It bundles together several core services – for logging, validating strategies and exchanges, and ultimately running the backtest itself – to streamline the process.

You can use the `run` method to kick off a backtest. This method takes a symbol (like a stock ticker) and some context details - the names of the strategy, exchange, and frame you want to use - and returns a sequence of backtest results as it runs. It’s designed to be used when you need to inject these services for testing or broader application integration.

# backtest-kit interfaces

## Interface WalkerContract

The WalkerContract represents updates as a backtesting comparison progresses. It provides information about each strategy as it finishes a testing run and is ranked.

You're given the name of the walker, the exchange, and the specific frame being used for testing, along with the symbol being analyzed. The contract also tells you which strategy just completed its run, along with its performance statistics.

A key piece of information is the metric value – this represents the value the system is trying to optimize. You’re also shown the best metric value seen so far and the name of the best-performing strategy found during the process.

Finally, the WalkerContract keeps you informed about the progress, telling you how many strategies have been tested and the total number of strategies that will be evaluated.


## Interface TickEvent

The `TickEvent` interface is designed to provide a single, consistent structure for all tick events generated during backtesting. It collects all the relevant data from different actions like opening, activating, closing, or even just idle states.

Each event includes a timestamp indicating when it occurred and the type of action that triggered it (idle, opened, active, or closed). For events involving trades (opened, active, or closed), you’ll find details like the trading symbol, the signal identifier, the position type, and any associated notes.

When a trade is opened, the `TickEvent` stores the open price, take profit level, and stop loss. Once closed, it provides crucial information about the outcome, including the PNL (profit and loss) percentage, reason for closure, and duration of the trade. This standardized format simplifies report generation and analysis of your backtest results.

## Interface ScheduleStatistics

This object holds all the statistics related to your scheduled trading signals. It’s a way to keep track of how many signals were planned, how many were actually executed, and how many were cancelled.

You’re able to see a full list of every scheduled and cancelled event, along with the overall number of events that occurred. It also provides a clear picture of how often your signals are being cancelled, expressed as a percentage, and gives you the average wait time for those cancelled signals, helping you understand potential issues with your scheduling.

## Interface ScheduledEvent

This interface helps you understand what happened with your automated trading signals. It bundles together all the important details about when a signal was scheduled or cancelled. 

You’ll find the exact time the event occurred, what type of action took place (scheduled or cancelled), and the specific trading pair involved. It also includes the signal’s ID, its position type, and any notes associated with it.

For closed or cancelled signals, you’ll also see the current market price at the time, the planned entry price, take profit and stop loss levels, and the time when the signal was closed, along with its duration. This gives you a complete picture of each signal's lifecycle for analysis and reporting.

## Interface ProgressWalkerContract

This interface describes the information provided during a background process, like when running a backtest kit. It lets you monitor how far along a particular backtesting run is.

You’ll see updates containing the name of the process, the exchange and frame being used, the trading symbol, the total number of strategies being evaluated, how many have been processed so far, and the overall completion percentage. It's basically a progress report for your backtesting efforts.

## Interface ProgressBacktestContract

This interface lets you monitor the progress of a backtest as it runs. It provides information about the backtesting process, telling you which exchange and strategy are being used, and the symbol being traded. 

You'll see the total number of historical data points (frames) the backtest will analyze, and how many have already been processed. It also gives you a percentage representing how far along the backtest is, ranging from 0% to 100%. This helps you understand how long the backtest might take to finish.

## Interface PerformanceStatistics

This data represents the overall performance of a trading strategy, providing a collection of key metrics. It tells you the name of the strategy being evaluated, and the total number of events that were tracked during its execution. You're also given the total time it took for the strategy to run. 

The `metricStats` property breaks down the performance even further, offering statistics organized by different types of metrics. Finally, `events` gives you access to the full list of individual performance events that were recorded, providing the raw data behind the aggregated statistics.

## Interface PerformanceContract

This interface, `PerformanceContract`, helps you understand how long different parts of your trading system are taking to execute. It’s like a performance log that gets filled during backtesting or live trading. Each entry records when something happened, how long it took, and which strategy, exchange, and symbol it relates to. The `timestamp` tells you exactly when an operation began, while `previousTimestamp` lets you calculate the time between events. This information is extremely valuable for spotting slow areas in your code and improving overall efficiency. You can use it to profile your strategies and identify bottlenecks. The `backtest` flag indicates whether the measurement came from a backtest run or from actual live trading.

## Interface MetricStats

This interface holds a collection of statistics related to a specific performance metric, like order execution time or fill duration. It provides a way to understand the overall performance characteristics of that metric. 

You’ll find key information like the total number of times the metric was recorded (count), the total duration across all those recordings, and the average duration.  It also includes details about the range of values, with minimum and maximum durations, along with statistical measures like standard deviation, median, and percentiles (95th and 99th). 

Finally, it summarizes wait times between events, giving you a comprehensive view of how long things typically take.

## Interface MessageModel

This `MessageModel` helps keep track of conversations with a language model, like you would when building a trading strategy that learns from its interactions. Think of it as a way to record the back-and-forth between a system, a user, and the LLM itself.

Each `MessageModel` has two key parts: a `role` that indicates who sent the message (whether it’s the system, the user, or the assistant/LLM), and `content`, which holds the actual text of the message. This structure lets you build up a history of interactions to use in prompts and keep context clear.

## Interface LiveStatistics

The `LiveStatistics` interface gives you a detailed view of your live trading performance. It tracks a comprehensive set of metrics calculated from every event your system generates, from idle periods to closed trades.

You'll find a complete log of all events in the `eventList`, along with the total number of events processed. It provides counts of closed trades, differentiating between winning and losing signals.

Key performance indicators like win rate, average profit per trade (`avgPnl`), and total profit (`totalPnl`) are available, allowing you to assess profitability.  Volatility is measured by standard deviation, and the Sharpe Ratio, both regular and annualized, offer insights into risk-adjusted returns. The certainty ratio helps gauge the consistency of winning versus losing trades. Finally, `expectedYearlyReturns` estimates potential annual gains based on trade duration and profits. All numeric values are carefully managed to avoid unsafe calculations, represented as null when calculations are not reliable.

## Interface IWalkerStrategyResult

This interface, `IWalkerStrategyResult`, represents the outcome of running a single trading strategy within a backtesting comparison. It bundles together key information about that strategy's performance.

You'll find the strategy's name, a collection of statistical data (`BacktestStatistics`) detailing its results, and a specific metric value used to compare it against other strategies. Finally, a rank is assigned to indicate the strategy's relative performance; the lower the rank number, the better it performed.

## Interface IWalkerSchema

The `IWalkerSchema` lets you set up A/B testing experiments comparing different trading strategies. Think of it as defining the rules of the game – you specify a unique name for your experiment, an optional note for your own records, and the exchange and timeframe you want to use for testing.

You also list the names of the strategies you want to compare; these strategies need to be registered beforehand.  The schema allows you to choose which metric, like Sharpe Ratio, will be used to judge the performance of each strategy. 

Finally, you can provide optional callbacks to get notified about different stages of the walker's lifecycle.

## Interface IWalkerResults

This interface holds all the information collected after running a strategy comparison, also known as a "walker." It bundles together details about the specific test conditions – which symbol was traded, on what exchange and timeframe – and the metric used to evaluate strategy performance. You’re able to see how many strategies were actually tested, and most importantly, it identifies the strategy that performed best based on the chosen metric, alongside its detailed statistics. Essentially, it’s a complete report summarizing the outcome of your backtesting comparison.

## Interface IWalkerCallbacks

This interface provides a way to hook into the backtest-kit's strategy comparison process, letting you react to key events. You can use it to monitor the progress of your backtesting runs and potentially customize how results are handled. 

Specifically, `onStrategyStart` is triggered when a new strategy begins testing, giving you a signal to log the start or prepare for data collection. `onStrategyComplete` is called when a strategy's testing finishes, providing you with the strategy's name, the asset being traded, backtest statistics, and a key metric to analyze. Finally, `onComplete` is invoked once all strategies have been tested, allowing you to access the overall results of the comparison.

## Interface IStrategyTickResultScheduled

This interface describes a tick result generated when a trading strategy schedules a signal, meaning it's waiting for the price to reach a specific level before executing a trade. You'll see this result when your strategy uses the `getSignal` function and it returns a signal that includes a desired entry price. 

It includes key information to help you understand what’s happening: the strategy’s name, the exchange being used, the symbol being traded (like "BTCUSDT"), the current price at the time the signal was scheduled, and the specific signal itself that's waiting for the price to match the entry point. Essentially, it’s a notification that a trade is primed and ready to go, pending the price action.

## Interface IStrategyTickResultOpened

This interface represents a signal that has just been created and opened by a trading strategy. Think of it as a notification that a new trade opportunity has been identified. 

It includes essential details about the signal itself, like the newly generated ID and the validated data. You’ll also find information about which strategy and exchange generated the signal, along with the trading symbol and the price used to open the position. This information helps you track and analyze the performance of your trading strategies.

## Interface IStrategyTickResultIdle

This interface represents what happens in your trading strategy when it's in a period of inactivity – essentially, it's waiting for a new trading opportunity. It tells you that no signal is currently active and the strategy is in an "idle" state. 

You'll see this type of result when your strategy isn't generating buy or sell instructions. The data included lets you track *why* it’s idle: you’re given the strategy's name, the exchange being used, the symbol being traded (like BTCUSDT), and the current price at the time it entered the idle state.  This is helpful for monitoring your strategy’s performance and understanding when it's waiting for the market to present a good chance to trade.

## Interface IStrategyTickResultClosed

This interface represents the result when a trading signal is closed, providing a complete picture of what happened. It details the signal itself, the price at which it closed, and the reason for its closure – whether it was due to time expiring, hitting a take-profit level, or a stop-loss trigger. You'll also find the exact timestamp of the closure, a breakdown of the profit and loss including fees and slippage, and identifying information about the strategy and exchange involved. Essentially, it's a final report card for a closed trading opportunity, providing all the crucial data for analysis and review.

## Interface IStrategyTickResultCancelled

This interface describes what happens when a scheduled trading signal is cancelled. It's used to report situations where a signal was planned but didn't actually lead to a trade being placed – perhaps the signal didn't trigger, or a stop loss was hit before a position could be opened. 

The data included tells you why the signal didn’t execute: the `action` property confirms it was "cancelled," and the `signal` property provides details about the scheduled signal itself. You’re also given the final price when the signal was cancelled (`currentPrice`), the time of cancellation (`closeTimestamp`), and identifying information like the strategy and exchange used. This information helps you understand why your trading strategy didn't take action and analyze its performance.

## Interface IStrategyTickResultActive

This interface represents a tick result indicating that a trading strategy is actively monitoring a signal. It's used when a strategy has placed a trade and is now waiting for a specific event like a Take Profit (TP), Stop Loss (SL), or time expiration to occur.

The result contains key information about the trade being monitored, including the signal that triggered it, the current price used for tracking, and identifiers for the strategy, exchange, and trading pair. Think of it as a snapshot of the trade’s status while it's actively managed by the strategy. Each property lets you understand the context of the trade and its current state.

## Interface IStrategySchema

This defines the structure for registering a trading strategy within the backtest-kit framework. Think of it as a blueprint for how a strategy will generate trading signals. 

Each strategy gets a unique name for identification. You can also add a note to explain your strategy for others (or yourself later!). 

The `interval` property controls how often the strategy can be checked for signals, preventing it from overwhelming the system.

The core of the strategy is the `getSignal` function – this is where the logic for deciding whether to buy or sell happens. It takes a ticker symbol as input and returns a signal, or nothing if no action is needed.  You can even make it wait for a specific price to be reached before triggering a trade.

Optionally, you can define lifecycle callbacks to be notified when a trade is opened or closed. Finally, a `riskName` allows you to associate the strategy with a specific risk profile.

## Interface IStrategyPnL

This interface, `IStrategyPnL`, represents the outcome of a trading strategy's profit and loss calculation. It breaks down how well a strategy performed, considering typical trading costs. You're given the percentage change in profit or loss (`pnlPercentage`), giving you a quick sense of the strategy's effectiveness.

You’ll also find the original entry price (`priceOpen`) and the exit price (`priceClose`), both of which have been adjusted to account for fees and slippage, so you can see the actual prices used in the trade. This provides a more realistic view of the strategy’s performance.

## Interface IStrategyCallbacks

This interface defines optional functions you can use to get notifications about what's happening during a trading backtest. Think of them as event listeners for your strategy. 

You can subscribe to events like `onTick` to react to every price update, `onOpen` when a new trade is initiated, `onActive` when a trade is actively running, `onIdle` when no trades are running, `onClose` when a trade is finished, `onSchedule` when a trade entry is planned for later, and `onCancel` when a scheduled trade is abandoned. There's also `onWrite`, which lets you monitor data written to persistent storage – mainly useful for testing purposes. Using these callbacks allows you to observe and react to the key moments in your backtest process.

## Interface IStrategy

The `IStrategy` interface outlines the essential functions any trading strategy built with backtest-kit needs to provide.

The `tick` method represents a single execution step, processing incoming market data and checking for potential trading signals while also monitoring stop-loss and take-profit levels.

You can use `getPendingSignal` to find out what signal, if any, is currently active for a specific asset. If no signal is active, it will return nothing.

The `backtest` function lets you quickly test your strategy against historical price data, which is a great way to see how it would have performed.

Finally, `stop` provides a way to pause your strategy's signal generation without immediately closing any existing trades; it's useful for situations where you need to temporarily disable trading but want to avoid premature position closures.

## Interface ISizingSchemaKelly

This interface defines how to calculate trade sizes using the Kelly Criterion. It lets you specify that you want to use the Kelly Criterion method for sizing your trades. You also set a multiplier, which controls how aggressively the Kelly Criterion is applied; a lower multiplier, like the default of 0.25, represents a more conservative approach, while a higher number increases the trade size based on your predictions. This helps you manage risk and optimize your trading strategy’s growth potential.

## Interface ISizingSchemaFixedPercentage

This schema defines a simple way to determine trade size: you're always risking a fixed percentage of your capital on each trade.  It's straightforward to use – you just specify the `riskPercentage`, which represents the portion of your capital you're comfortable losing on any single trade, expressed as a number between 0 and 100. The `method` property is always set to "fixed-percentage" to identify this particular sizing strategy. It’s a good choice when you want consistent risk exposure across all your trades.

## Interface ISizingSchemaBase

This interface, `ISizingSchemaBase`, provides the foundation for how your trading strategies determine position sizes. It defines essential properties like a unique `sizingName` to identify the sizing method, a `note` field for helpful developer comments, and limits on position sizes – `maxPositionPercentage`, `minPositionSize`, and `maxPositionSize` – to ensure controlled risk. You can also include `callbacks` to hook into different stages of the sizing calculation for custom logic. Think of this as the blueprint for creating different ways your strategy decides how much to trade.

## Interface ISizingSchemaATR

This schema defines how your trades will be sized using the Average True Range (ATR) as a key factor. It’s designed for strategies that want to dynamically adjust trade size based on market volatility. 

The `method` is always set to "atr-based", indicating this is an ATR sizing approach.  The `riskPercentage` specifies the maximum percentage of your capital you're willing to risk on each trade – a common risk management technique.  Finally, `atrMultiplier` determines how much the ATR value influences the stop-loss distance, essentially scaling the stop based on how volatile the market is. A higher multiplier results in wider stops during periods of high volatility.

## Interface ISizingParamsKelly

The `ISizingParamsKelly` interface defines how you can configure your trading sizing strategy when using the Kelly Criterion within backtest-kit. Think of it as a set of instructions for telling the framework how to determine the size of each trade you take.

It focuses on providing a logger, which is essentially a tool for observing and debugging the sizing calculations – it helps you understand what’s happening behind the scenes. This logger allows you to see the parameters and results of the Kelly Criterion calculations to make sure things are behaving as expected.

## Interface ISizingParamsFixedPercentage

This interface, `ISizingParamsFixedPercentage`, helps you define how much of your capital you’re going to use for each trade when using a fixed percentage sizing strategy. It's a simple way to control your risk.

The key part is the `logger`. This is where you plug in a logging service to help you monitor and debug your backtesting process – it allows you to see what’s going on behind the scenes.

## Interface ISizingParamsATR

This interface, `ISizingParamsATR`, helps you configure how much of your capital to use for each trade when using an ATR-based sizing strategy. It's designed to be used when setting up your trading strategy within backtest-kit.

You're required to provide a `logger` which is used to log any debugging information or messages related to your sizing calculations. Think of it as a way to keep track of what's happening behind the scenes and help diagnose any potential issues.

## Interface ISizingCallbacks

This interface defines functions that are called during the sizing process of your trading strategy. Specifically, `onCalculate` is triggered right after the framework determines the size of your position. You can use this callback to observe or double-check the size that's been calculated, perhaps for logging purposes or to ensure it aligns with your expectations.

## Interface ISizingCalculateParamsKelly

This interface defines the information needed to calculate trade sizing using the Kelly Criterion. To use it, you’ll need to specify the method, which is always "kelly-criterion" for this specific calculation. You also need to provide the win rate, a value between 0 and 1 representing the frequency of winning trades, and the average win/loss ratio, which tells you how much you typically win compared to how much you lose on each trade. These values feed into a formula that helps determine the optimal amount of capital to allocate to each trade.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the parameters needed when you want to size your trades using a fixed percentage of your account balance. It's a straightforward approach where the trade size is determined by a predefined percentage. 

You'll provide two key pieces of information: the `method`, which must be set to "fixed-percentage" to indicate you’re using this sizing method, and the `priceStopLoss`, which represents the price at which you’ll set your stop-loss order.

## Interface ISizingCalculateParamsBase

This interface defines the fundamental information needed for any sizing calculation within the backtest-kit framework. It provides access to key data points like the trading pair's symbol – for example, "BTCUSDT" – so the sizing logic knows what asset is being traded.  You'll also have the current balance of the trading account available, and the anticipated entry price at which the trade will be initiated. These base parameters are shared across all sizing calculations, providing a standardized starting point.

## Interface ISizingCalculateParamsATR

This interface defines the information needed to calculate trade size using an ATR (Average True Range) based method. When you’re using this approach to determine how much to trade, you'll provide the `method` as "atr-based" and specify the current `atr` value, which represents the average range of price movement. Think of `atr` as a measure of volatility – a higher ATR means bigger swings in price, potentially justifying a smaller position size.

## Interface ISizing

The `ISizing` interface is all about figuring out how much to trade – the size of your position. It's a core part of how backtest-kit executes trading strategies, handling the crucial step of determining how much capital to allocate to each trade.

The key to this interface is the `calculate` property. This function takes in a set of parameters related to risk management and returns a promise that resolves to the calculated position size. Think of it as the engine that takes your risk rules and turns them into a specific number of shares or contracts to trade.

## Interface ISignalRow

This interface represents a complete signal ready to be used within the backtest-kit framework. Think of it as the final, validated form of a signal after it's been processed.

Each signal has a unique identifier, automatically created for easy tracking.  It also includes the entry price you’d use for a trade. 

You’ll find details about which exchange and strategy generated the signal, along with the timestamps for when it was initially created and when it became pending.  The trading symbol, like "BTCUSDT", is clearly defined. 

Finally, there's an internal flag that indicates whether the signal was scheduled, used primarily for the system's own record-keeping.

## Interface ISignalDto

The `ISignalDto` represents a trading signal, the kind you'd get when requesting a signal from the backtest-kit. It's essentially a data package holding all the details needed to execute a trade.

Each signal includes a unique ID – this is automatically created if you don't provide one. You’ll also specify the trade direction, whether you're going long (buying) or short (selling).  A descriptive note helps explain the reasoning behind the signal.

Crucially, you define the entry price, a take profit target, and a stop-loss level to manage risk. The take profit and stop loss prices must be set according to the direction of your trade, ensuring they make logical sense. Finally, you can estimate how long you expect the trade to last before it expires.

## Interface IScheduledSignalRow

This interface, `IScheduledSignalRow`, represents a trading signal that's waiting for the price to reach a specific level before it's executed. Think of it as a signal with a delayed activation.

It builds upon the `ISignalRow` interface, essentially holding a signal that's not immediately actionable. The `priceOpen` property defines the price that the market needs to reach before the signal triggers and becomes a standard pending signal. 

Initially, the `pendingAt` time will reflect when the signal was scheduled. Once the price hits the `priceOpen` level and the signal activates, `pendingAt` is updated to show the actual time it waited. This allows you to track how long a signal was delayed.

## Interface IRiskValidationPayload

This data structure helps risk validation functions understand the current state of your trading portfolio. It builds upon the `IRiskCheckArgs` by providing details about your active positions. You'll find the total number of open positions, represented by `activePositionCount`, as well as a list of those positions with more specifics in the `activePositions` array. This allows risk checks to consider your current exposure and adjust accordingly.

## Interface IRiskValidationFn

This defines a specific function type used within backtest-kit to ensure your risk management settings are correct. Think of it as a quality check for your trading parameters. This function takes your risk settings as input and performs a series of checks – it's responsible for making sure those settings are reasonable and won't lead to unexpected or problematic behavior during backtesting. If anything is amiss, the function will raise an error, preventing the backtest from running with potentially flawed risk parameters.

## Interface IRiskValidation

This interface, `IRiskValidation`, helps you define checks to ensure your trading strategies are behaving as expected. It's all about adding a layer of safety and understanding to your backtesting process. 

You specify the actual validation logic through the `validate` property, which is a function that will perform the check.  Think of it as writing a rule that must be true for your trading parameters to be considered valid.

The `note` property is there to provide extra context; it's a simple way to add a description explaining *why* you have this specific validation in place. It's purely for documentation and doesn't affect how the validation runs.

## Interface IRiskSchema

This interface, `IRiskSchema`, helps you define and manage risk controls for your trading portfolio. Think of it as a blueprint for how you want to ensure your trades stay within acceptable boundaries.

You're required to give each risk profile a unique identifier, the `riskName`.  You can also add a `note` to explain the purpose of this risk profile – helpful for keeping things organized.

If you want to hook into specific points in the risk assessment process, you can specify `callbacks` to run custom code when a trade is rejected or allowed. 

The core of this schema lies in the `validations` array.  This array is where you put your custom validation logic, either as individual functions or pre-defined validation objects, to enforce your portfolio’s risk rules.

## Interface IRiskParams

The `IRiskParams` interface helps you configure how risk calculations are handled within the backtest-kit framework. Think of it as a set of options you pass when setting up a risk management system. A key part of this configuration is providing a `logger` – this allows the system to log important information and debugging messages as it runs, making it easier to understand what's happening. Essentially, `IRiskParams` lets you customize the logging for your risk calculations.

## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, holds the information your strategy needs to decide if it's safe to place a new trade. Think of it as a set of checks performed *before* your strategy generates a trading signal. It provides details like the trading pair’s symbol, the name of the strategy making the request, the exchange being used, the current price, and the current time. Essentially, it’s a snapshot of the relevant conditions for assessing risk before a potential trade is made. This helps ensure your strategy only executes trades when conditions are appropriate.

## Interface IRiskCallbacks

This interface lets you hook into the risk management system of backtest-kit. It provides two optional functions you can define: `onRejected` and `onAllowed`.  If a trading signal is blocked because it hits a risk limit, the `onRejected` function will be called, giving you information about the symbol and the reason for rejection. Conversely, if a signal makes it through all risk checks, the `onAllowed` function will be triggered, also providing details about the symbol. Think of these callbacks as notifications letting you know what's happening with risk assessments for your trades.

## Interface IRiskActivePosition

This interface describes a single, active trading position that's being monitored by the risk management system. Think of it as a snapshot of a trade as it's happening, allowing for analysis across different trading strategies.

It includes key details such as the signal that triggered the trade (`signal`), the name of the strategy responsible for it (`strategyName`), and the exchange where the trade occurred (`exchangeName`).  The `openTimestamp` tells you exactly when the position was started, which is crucial for tracking performance and risk over time. This information is vital for understanding how different strategies interact and for overall risk assessment.


## Interface IRisk

The `IRisk` interface helps manage and control the risk involved in your trading strategies. It provides tools to ensure your signals align with predefined risk limits and to keep track of open and closed positions.

You can use `checkSignal` to see if a potential trade is allowed based on your risk rules.  `addSignal` lets you register when a new position is opened, and `removeSignal` handles it when a position closes, ensuring your risk tracking stays accurate. This interface is essential for building robust and controlled trading systems.


## Interface IPositionSizeKellyParams

This interface, `IPositionSizeKellyParams`, helps you calculate position sizes using the Kelly Criterion, a popular method for risk management and sizing trades. It defines the key inputs needed for this calculation.

You'll need to provide a `winRate`, which represents the percentage of winning trades you expect. 

You also need to specify a `winLossRatio`, reflecting your average profit compared to your average loss on each trade. These two values together determine how much of your capital you should allocate to each trade.

## Interface IPositionSizeFixedPercentageParams

This interface defines the parameters needed for a trading strategy that uses a fixed percentage of your capital for each trade, and includes a stop-loss price. Specifically, `priceStopLoss` tells the system at what price to place your stop-loss order to manage risk. It’s essentially the key piece of information needed to determine how aggressively you're sizing your positions based on a percentage of your account balance and a defined risk level.

## Interface IPositionSizeATRParams

This interface defines the parameters needed to calculate your position size using an Average True Range (ATR) approach.  The core of this calculation relies on the `atr` property, which represents the current ATR value you’re using. This value essentially tells you how much the price has been fluctuating recently, influencing how much of your capital you’re willing to allocate to a trade. Essentially, a higher ATR suggests more volatility and potentially a smaller position size.

## Interface IPersistBase

This interface defines the basic functions needed to read, write, and check for the existence of data within a persistent storage system. Think of it as the foundation for managing how your trading strategies store and retrieve information.

The `waitForInit` function ensures the storage directory is set up correctly and any necessary setup happens only once. 

`readValue` lets you fetch a specific piece of data, identified by a unique ID.  If you just want to know if a piece of data exists, `hasValue` provides a quick way to check without actually retrieving it. Finally, `writeValue` is used to save data to the storage, making sure the operation is done safely and reliably.

## Interface IOptimizerTemplate

The `IOptimizerTemplate` interface helps you create the building blocks for your backtesting code, especially when using Large Language Models (LLMs). It provides methods to generate code snippets for various parts of your trading system.

You can use it to quickly generate initial setup code, like the top banner with necessary imports, or to construct messages you’ll send to and receive from an LLM for prompting strategies.  It also lets you create configuration code for key components like Exchanges, Frames (timeframes), and individual Strategies. 

Need to build a walker to orchestrate your system? This interface provides a method for that too. Additionally, you can use it to easily generate helper functions for debugging (like `dumpJson()`) and for structured or text-based LLM output (`json()` and `text()`). The overall goal is to streamline the process of building and configuring your backtesting environment.


## Interface IOptimizerStrategy

This interface, `IOptimizerStrategy`, bundles together all the information that goes into creating a trading strategy. Think of it as a complete package containing everything needed to understand how a strategy was built.

It includes the trading symbol the strategy is designed for, a unique name to identify it, and most importantly, the full conversation history with the LLM that was used to develop the strategy. This conversation gives you the context behind the strategy’s logic. 

Finally, it holds the actual strategy definition itself, which is the prompt or description generated by the LLM and used to guide trading decisions.

## Interface IOptimizerSourceFn

This function is designed to provide data specifically for optimizing your trading strategies. Think of it as a pipeline that feeds your optimizer with the historical data it needs to learn and improve. It's built to handle large datasets efficiently, allowing you to retrieve data in manageable chunks through pagination. Crucially, each piece of data it provides needs to have a unique identifier – this helps the optimizer keep track of everything and avoid confusion during the learning process.

## Interface IOptimizerSource

This interface, `IOptimizerSource`, helps you connect your backtesting data to a language model. It defines how your data is retrieved and presented for use in conversations, like when you're exploring strategies.

You give it a `name` so you can easily identify the data source and reference it in your code. The `fetch` property is the most important – it's the function that actually retrieves the data, and it needs to handle getting data in chunks, or "pages," for efficient processing.

You can also provide a short `note` to describe the data source’s purpose.

If you want to customize how the data appears as "user" or "assistant" messages, you can define `user` and `assistant` formatting functions. If you don't, the framework will use its own default formatting.

## Interface IOptimizerSchema

This interface describes the configuration needed to register an optimizer within the backtest-kit trading framework. Think of it as a blueprint for creating and evaluating different trading strategies.

You’ll define things like a unique name for your optimizer, and specify time ranges for training and testing strategies. The `rangeTrain` property lets you create multiple strategy variations based on different training periods, allowing for comparisons. 

Data sources are also a key part of this configuration; these contribute information used when generating strategies. The `getPrompt` function is responsible for constructing the prompts fed into the language model, using the conversation history and data sources.

You can also customize the strategy generation process using the `template` property, and optionally add lifecycle monitoring callbacks with `callbacks`. This interface gives you a lot of control over how strategies are created and assessed.

## Interface IOptimizerRange

This interface, `IOptimizerRange`, lets you clearly define the timeframe for backtesting and optimizing your trading strategies. Think of it as setting the boundaries for your historical data – when do you want to start looking at past performance, and when do you want to stop? You specify this with the `startDate` and `endDate` properties, which are both JavaScript `Date` objects. Optionally, you can add a `note` to describe this specific timeframe, like "2023 bear market" or "post-pandemic recovery". This helps keep your backtesting organized and easy to understand.

## Interface IOptimizerParams

This interface defines the settings needed to set up the core optimization process. Think of it as a container for essential tools and blueprints. 

It requires a logger to keep track of what’s happening and provide helpful messages during optimization. 

Crucially, it also needs a complete template – a set of instructions and pre-built components that dictate how the optimization runs, combining your specific configurations with some foundational settings.

## Interface IOptimizerFilterArgs

This interface defines the information needed to request specific data for backtesting. It lets you specify which trading pair – identified by its symbol like "BTCUSDT" – you're interested in, and the exact date range you want data for, starting and ending with particular dates. Essentially, it's a way to narrow down the historical data used in your backtesting simulations. 


## Interface IOptimizerFetchArgs

When fetching data for optimization, this interface defines how much data to grab at a time. Think of it like paging through a really long list – `limit` tells you how many items to show on each page, and `offset` tells you where to start showing those items.  The default is to get 25 items per page, but you can change that to suit your needs. This helps keep your memory usage reasonable when dealing with large datasets.

## Interface IOptimizerData

This interface defines the basic structure for data used in optimization processes. Every data source you use with the backtest-kit needs to provide data that includes a unique identifier. This ID, called `id`, is crucial for preventing duplicate entries when you’re working with large datasets or data that's being fetched in chunks. Think of it as a fingerprint for each piece of information, ensuring that each one is processed only once.

## Interface IOptimizerCallbacks

The `IOptimizerCallbacks` interface lets you keep an eye on what's happening during the optimization process and even step in to influence it. 

Think of it as a series of checkpoints where you can react to different events. For example, after your trading strategies' data is prepared, the `onData` callback lets you inspect it, perhaps for logging or verification. Similarly, `onCode` notifies you when the strategy code is ready, and `onDump` fires after the code is saved to a file. Finally, `onSourceData` lets you track when data is brought in from your data sources, allowing you to log or validate that data as it arrives. These callbacks give you a way to understand and potentially control the entire optimization workflow.

## Interface IOptimizer

The `IOptimizer` interface provides a way to generate and export trading strategies. 

Think of it as a tool that gathers data, builds a blueprint for a strategy, and then turns that blueprint into actual code you can run. 

The `getData` method pulls together all the necessary information and prepares it for strategy creation.  `getCode` then takes that prepared data and constructs the full trading strategy code, ready for execution. Finally, `dump` allows you to save the generated code directly to a file, organizing it into a neatly structured project. 

It’s designed to streamline the process of building and deploying strategies, automating much of the repetitive coding work.


## Interface IMethodContext

The `IMethodContext` interface acts as a little guide for your backtesting operations, telling the system which specific configurations to use. Think of it as a set of instructions – it holds the names of the strategy, exchange, and frame that your trading logic should be based on.  This context is passed around to help ensure the right pieces of your trading setup are used consistently. The `exchangeName` tells the system which exchange to connect to, `strategyName` specifies the trading strategy, and `frameName` indicates the timeframe for analysis (though it’s often empty when you’re trading live).

## Interface ILogger

The `ILogger` interface provides a standardized way for different parts of the backtest-kit framework to record information. It’s like having a central notepad for the system, allowing developers to track what’s happening.

You can use it to write down general events (`log`), detailed debugging information (`debug`), informational updates about successful actions (`info`), or to flag potential issues that aren't critical failures (`warn`). This logging helps in understanding how the system works, spotting errors, and keeping an audit trail of activity.

## Interface IHeatmapStatistics

This interface holds the overall performance statistics for your portfolio when visualizing it as a heatmap. It gathers data across all the assets you're tracking, giving you a broad picture of how your portfolio is doing.

You’re provided with an array of `IHeatmapRow` objects, each representing data for a specific symbol. The `totalSymbols` property tells you exactly how many assets are included in this calculation. 

Beyond that, you're given key summary metrics like the total profit and loss (`portfolioTotalPnl`), the Sharpe Ratio which assesses risk-adjusted return (`portfolioSharpeRatio`), and the total number of trades executed (`portfolioTotalTrades`). This gives you a quick and easy way to understand your portfolio's performance and trading activity.

## Interface IHeatmapRow

This interface represents a single row in a portfolio heatmap, giving you a quick overview of how a specific trading pair performed across all your strategies. It bundles together key statistics like total profit or loss, risk-adjusted return (Sharpe Ratio), and the largest drawdown experienced.

You'll find metrics detailing the number of trades, how many were winners versus losers, and the win rate. It also provides insight into the profitability of your trades with data on average profit per trade, average win and loss amounts, and the profit factor. 

Finally, it includes streak information (longest win and loss streaks) and expectancy, a more complex measure of long-term profitability. Each `IHeatmapRow` gives you a concise snapshot of a trading pair's overall performance.

## Interface IFrameSchema

The `IFrameSchema` lets you define a specific timeframe for your backtesting simulations. Think of it as setting the boundaries for how far back in time your strategy will be tested and how frequently data will be generated. 

Each schema has a unique name to identify it and you can add a note to help explain what it's for. You're required to specify a `startDate` and `endDate` to indicate the backtest period, and an `interval` determines how often timestamps are created within that period.  

Finally, you can optionally include lifecycle callbacks to run custom logic at different points during the frame’s lifecycle.

## Interface IFrameParams

The `IFrameParams` interface defines the information needed when setting up a trading frame within the backtest-kit framework. Think of it as the configuration object you provide to initialize the core trading environment.  It builds upon the `IFrameSchema` and crucially includes a `logger`. This logger is your window into what's happening internally within the frame, allowing you to debug and understand the backtesting process. It's an essential tool for troubleshooting and ensuring your backtest runs smoothly.

## Interface IFrameCallbacks

The `IFrameCallbacks` interface lets you hook into key events happening within the backtest-kit framework as it sets up the timeframes for your backtesting. Specifically, the `onTimeframe` property gives you a chance to be notified whenever the timeframe array is created. This is a handy way to check if the timeframes look right, maybe log some data, or perform other validation steps. You're provided with the array of dates, the start and end dates of the timeframe, and the interval used to generate the timeframe.

## Interface IFrame

The `IFrame` interface is a core part of backtest-kit, responsible for creating the timeline your strategies will be tested against. Think of it as the clock that drives your backtesting process. 

Its primary function, `getTimeframe`, allows you to request a series of dates and times for a specific trading symbol and a given timeframe (like "1m" for one-minute intervals or "1d" for daily data). This method fetches the timestamps needed to iterate through your backtest and evaluate your trading decisions against historical data. It’s how the framework knows when and in what order to execute your strategy’s logic.


## Interface IExecutionContext

The `IExecutionContext` interface holds important information needed during strategy execution or when testing a trading strategy. Think of it as a container of runtime details. It includes the trading symbol, like "BTCUSDT," the current timestamp representing the time of the event, and a flag indicating whether the system is running a backtest or a live trade. This context is automatically passed around by the framework, giving your strategies access to these crucial parameters without needing to explicitly manage them.

## Interface IExchangeSchema

The `IExchangeSchema` lets you define how backtest-kit interacts with a specific cryptocurrency exchange. Think of it as a blueprint for connecting to an exchange's data and understanding its rules.

You'll provide a unique name to identify the exchange, and optionally add a note for yourself or other developers. The most important part is `getCandles`, a function that tells backtest-kit how to retrieve historical price data (candles) from the exchange – whether that’s from an API or a database.

You also specify functions to correctly format trade quantities and prices, ensuring they align with the exchange's specific precision rules. Finally, you can add optional callback functions to react to events like new candle data being received.

## Interface IExchangeParams

The `IExchangeParams` interface defines the information you provide when setting up an exchange within the backtest-kit framework. It’s essentially a configuration object.

You’re required to supply a `logger` object, which allows you to record debug messages and keep track of what’s happening during your backtesting process.

Also, an `execution` object is needed. This provides important contextual information like the trading symbol, the time period, and whether the run is a backtest or a live execution.  It ensures your exchange operates within the correct environment and uses the expected data.

## Interface IExchangeCallbacks

This interface defines optional functions that your trading system can use to react to incoming data from an exchange. Specifically, the `onCandleData` function allows your system to be notified whenever new candlestick data becomes available. You can use this to update your charts, recalculate indicators, or trigger trading decisions based on the latest price action. It provides the symbol, interval, timestamp range, number of candles received, and the actual candle data itself.

## Interface IExchange

The `IExchange` interface defines how backtest-kit interacts with a trading exchange. It provides methods for getting historical and future candle data, essential for simulating trades. You can request candles for a specific trading symbol and time interval, and retrieve them using `getCandles` or `getNextCandles`.

It also handles the nuances of each exchange by formatting trade quantities and prices to match the exchange's rules, using `formatQuantity` and `formatPrice`. Finally, `getAveragePrice` allows you to calculate the VWAP (Volume Weighted Average Price) – a common indicator – using the data from the most recent candles. This helps understand the average price at which an asset has traded.

## Interface IEntity

This interface, `IEntity`, acts as the foundation for anything you're storing and retrieving from a database within the backtest-kit framework. Think of it as a blueprint – if your data needs to be saved, it probably needs to implement this interface. It establishes a common structure that allows the framework to work seamlessly with different kinds of data, making your code more organized and easier to maintain.

## Interface ICandleData

This interface, `ICandleData`, represents a single snapshot of price and volume information for a specific time period in trading. Think of it as a building block for constructing historical price charts. Each `ICandleData` object contains the timestamp – a record of when the candle began – along with the opening price, the highest price reached, the lowest price touched, the closing price, and the total trading volume during that time. It's a core data structure used for backtesting strategies and calculating things like VWAP (Volume Weighted Average Price).

## Interface DoneContract

This interface, DoneContract, is your notification when a background task – whether it's a backtest or a live trade – has finished running. Think of it as a completion signal.

It provides key information about what just finished, like the name of the exchange used, the specific trading strategy that ran, and whether it was a backtest or a live execution. You’ll also find the symbol being traded, such as "BTCUSDT". It helps you track and understand the status of your background operations.


## Interface BacktestStatistics

This interface holds all the key statistical results from your backtest. It gives you a detailed picture of how your trading strategy performed.

You’ll find a list of every closed trade with its specifics, along with the total number of trades executed. The interface also tracks the number of winning and losing trades, allowing you to calculate the win rate – the percentage of profitable trades. 

To assess overall profitability, the interface provides average PNL (profit and loss) per trade and the total PNL across all trades. Risk is also considered with metrics like standard deviation (volatility) and the Sharpe Ratio, which helps evaluate performance adjusted for risk. You can also see an annualized version of the Sharpe Ratio for a clearer long-term view. Finally, it includes the certainty ratio, gauging the relationship between average wins and losses, and the expected yearly returns.

