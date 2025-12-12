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

You can now control how backtest-kit reports its internal activity by providing your own logging mechanism. This function allows you to replace the default logging with something tailored to your needs, like sending logs to a file, a database, or a monitoring service. When you set a custom logger, the framework will automatically include helpful details like the strategy name, exchange used, and the asset being traded alongside each log message. This makes it easier to understand what's happening during backtesting and to debug any potential issues. To use it, simply provide an object that fulfills the `ILogger` interface.

## Function setConfig

This function lets you adjust how the backtest-kit framework operates by modifying its global settings. Think of it as fine-tuning the engine of your trading simulations. You can selectively update specific configuration options instead of redefining the entire configuration from scratch, making it flexible for various testing scenarios.  There's a special "unsafe" flag; use it cautiously, typically only when running tests where you need to bypass certain validation checks.

## Function listWalkers

This function lets you see all the different "walkers" that are currently active within the backtest-kit framework. Think of walkers as building blocks for your trading strategies – this allows you to get a list of all those building blocks. It's helpful if you're trying to understand what's going on behind the scenes, creating documentation, or building a user interface that needs to know about all available walkers. Essentially, it gives you a clear picture of the walkers that have been added to the system.


## Function listStrategies

This function provides a simple way to see all the trading strategies that have been set up within the backtest-kit framework. It returns a list of strategy descriptions, allowing you to understand what strategies are available for testing. Think of it as a catalog of your strategies, handy for checking your setup or building tools to manage them. The returned list contains detailed information about each strategy, making it easy to inspect and work with.

## Function listSizings

This function lets you see all the sizing configurations that are currently active within the backtest-kit framework. Think of it as a way to peek under the hood and understand how your trades are being sized. It returns a list of these sizing schemas, allowing you to inspect them for troubleshooting, to generate documentation, or to build user interfaces that adapt to different sizing strategies. Essentially, it's a simple way to get a comprehensive view of how sizing is being handled in your backtesting environment.

## Function listRisks

This function allows you to see all the risk configurations currently active within the backtest-kit framework. Think of it as a way to inspect what kinds of risks the system is aware of. It returns a list of these risk configurations, making it handy for things like checking your setup, generating documentation, or creating user interfaces that adapt to the available risk types. You're essentially getting a peek under the hood to see how the system is assessing potential dangers.

## Function listOptimizers

This function lets you see all the optimization strategies that are currently set up within your backtest kit. Think of it as a way to peek under the hood and see exactly what's available for optimizing your trading strategies. It returns a list, so you can easily loop through and examine each optimizer's details. This is helpful if you’re trying to understand how your system is configured or if you want to build tools that dynamically display optimization options.

## Function listFrames

This function allows you to see a complete list of all the data "frames" currently defined within your backtest environment. Think of frames as the different data sources your trading strategy uses, like price data, volume, or custom indicators.  It’s really helpful when you’re trying to understand what data is available for your strategies, or if you need to generate documentation about your setup. You can use it to confirm that all the frames you expect are present, or to programmatically build user interfaces that interact with these frames. The result is a promise that resolves to an array of frame schemas, each describing a frame's structure and properties.

## Function listExchanges

This function helps you discover all the exchanges your backtest-kit framework knows about. It returns a list of exchange details, allowing you to see which platforms are configured and ready for backtesting. Think of it as a way to inspect the available data sources and ensure everything is set up correctly. It’s particularly handy when you’re setting up your environment, creating documentation, or building interfaces that need to adapt to different exchanges.

## Function listenWalkerProgress

This function lets you keep track of how a backtest is progressing. It's like getting updates as each strategy finishes running within the backtest process. The updates are sent to you one at a time, ensuring that your code receives them in the order they happen, even if your code needs to do something asynchronous when it gets an update. To stop listening for these progress updates, the function returns a function that you can call to unsubscribe. You provide a function that will be called with each update, giving you a consistent stream of information about the backtest’s advancement.

## Function listenWalkerOnce

This function lets you set up a listener that reacts to events from a walker, but it only runs once and then stops listening. You provide a filter – a rule that determines which events you're interested in – and a callback function that gets executed when a matching event occurs. It's perfect for situations where you need to wait for a specific condition to be met within the walker’s progress. The function returns an unsubscribe function that you can call if you want to manually stop the listener before it executes.


## Function listenWalkerComplete

This function lets you listen for when the backtest walker finishes running all your strategies. It’s like setting up an alert that goes off when everything is done. Importantly, when the walker is complete, your callback function will be executed, and any async operations within that function will be handled in a safe, sequential order to avoid any issues with running things at the same time. You provide a function that will be called when the walker is finished, and this function returns another function that you can use to unsubscribe from the events later if needed.

## Function listenWalker

This function lets you keep an eye on how your backtest is progressing. It's like setting up a notification system that tells you when each strategy within your backtest has finished running. The notifications are sent one after another, even if the information you receive requires some processing – this ensures things happen in the correct order.  You provide a function that will be called for each strategy's completion, and this function receives data about the strategy's progress. The function you provide will also return a function that can be used to unsubscribe from the event.

## Function listenValidation

This function lets you keep an eye on potential problems during the risk validation process. It allows you to register a callback that gets triggered whenever a validation check encounters an error. Think of it as a safety net to catch and handle unexpected issues. These errors are handled one at a time, even if your handling function takes some time to complete, ensuring a predictable and controlled response. You provide a function that will be called with an error object whenever a validation fails.

## Function listenSignalOnce

This function lets you temporarily subscribe to signals from your trading strategy, but only for a single event that meets your criteria. You provide a filter that defines which signal events you’re interested in, and a callback function that will be executed exactly once when a matching event occurs. After that single execution, the subscription automatically ends, simplifying your code and preventing unintended continuous actions. Think of it as setting up a short-term alert for a specific signal condition. It’s particularly handy when you need to react to a particular event and then move on. 

The `filterFn` is the condition that must be met for an event to trigger your callback. The `fn` is what happens when the condition is met.

## Function listenSignalLiveOnce

This function lets you quickly react to specific trading signals coming from a live simulation. Think of it as setting up a temporary alert that only fires once when a certain condition is met. You provide a filter—a way to describe the kind of signal you’re interested in—and a function to execute when that signal arrives. The function will automatically unsubscribe after it runs, so you don't have to worry about managing subscriptions. This is handy for things like taking a single action based on a specific market opportunity during a live test.

You specify what kind of event you want to listen for with the `filterFn` parameter. The `fn` parameter defines what happens when an event matches your filter.

## Function listenSignalLive

This function lets you tap into the live trading signals generated by backtest-kit. It’s like setting up a listener that gets notified whenever a new signal is produced during a live run. Importantly, these signals are processed one at a time, ensuring they arrive in the order they were created. To receive these signals, you provide a function that will be called with the signal data. This is designed to work specifically with signals coming from a `Live.run()` execution.

## Function listenSignalBacktestOnce

This function lets you tap into the backtest results, but only for specific events and just once. You provide a filter – essentially a rule – that determines which events you're interested in. Then, you give it a function that will be executed *only* when an event matches your filter. Once that function runs, the subscription automatically ends, ensuring you won't receive any further signals. It’s great for quickly reacting to a specific, anticipated event during a backtest without ongoing subscriptions. 

It only works with events generated during a `Backtest.run()` execution. 

The first argument is the filter function, and the second is the callback function to be executed.


## Function listenSignalBacktest

This function lets you tap into the backtest process and get notified whenever a signal is generated. Think of it as setting up a listener that waits for updates from your trading strategy during a backtest. 

It's important to know that you're only going to receive signals if you're running a backtest using `Backtest.run()`. The signals are delivered one after another, ensuring they're processed in the order they occurred. You provide a function, and this function will be called each time a new signal is ready to be handled. This allows you to react to signals in a controlled and sequential way during your backtest.


## Function listenSignal

This function lets you tap into the trading signals generated by backtest-kit. Think of it as subscribing to updates on what's happening with your strategy – when it's idle, when it opens a position, when a position is active, and when it's closed. The key thing to know is that these updates will be delivered one at a time, in the order they happen, even if your callback function needs to do some processing that takes a little time. It ensures that these updates are handled sequentially, preventing things from getting out of sync. You simply provide a function that will be called whenever a signal event occurs, and that function receives all the relevant information about the event.


## Function listenPerformance

This function lets you keep an eye on how your trading strategies are performing, specifically focusing on timing. It's like setting up a listener that gets notified whenever a performance metric changes during your strategy's execution. You provide a function that will be called with details about these performance events, allowing you to profile your code and pinpoint areas that might be slowing things down. Importantly, the order of these events is maintained, and your callback function runs sequentially, even if it’s an asynchronous operation. This ensures a controlled and predictable way to track performance.


## Function listenPartialProfitOnce

This function lets you set up a one-time alert for partial profit levels being hit. You provide a filter that defines what conditions you're looking for – perhaps a specific profit percentage or price point. Once an event matches that filter, the provided callback function runs just once, and then the subscription automatically stops. It’s a convenient way to react to a particular profit situation without needing to manage ongoing subscriptions.

You give it two things: a filter to identify the events you care about, and a function to execute when a matching event occurs. This function handles the subscription and unsubscription, so you don't have to.


## Function listenPartialProfit

This function lets you keep track of your trading progress as you reach different profit levels during a backtest. It will notify you whenever your trade hits milestones like 10%, 20%, or 30% profit. Importantly, these notifications are handled one at a time to ensure things run smoothly, even if your notification handling involves some processing or calculations. You provide a function that gets called with details about the profit level reached. The function you give it also returns a function that you can use to unsubscribe from these notifications later.

## Function listenPartialLossOnce

This function lets you react to specific partial loss events just once and then automatically stops listening. Think of it as setting up a temporary alert for a particular loss scenario. You provide a filter that defines what kind of loss event you’re interested in, and a function that will be executed when that event occurs. Once the event is triggered and your function runs, the subscription is automatically removed, ensuring you don't get repeated notifications. It’s perfect for situations where you need to perform an action based on a loss condition, but don’t want to continuously monitor for it.

The `filterFn` helps you pinpoint exactly the loss event you’re looking for. The `fn` is what actually does something when that event happens.

## Function listenPartialLoss

This function lets you keep track of how much your trading strategy has lost along the way, specifically when it hits predefined loss levels like 10%, 20%, or 30%. It’s like setting up alerts for significant drops in your account balance. 

The cool thing is that these alerts are handled in a controlled way - even if your callback function takes some time to process, the system ensures events are handled one after another, preventing any messy overlaps. To use it, you simply provide a function that will be called whenever a partial loss level is reached, and it will return a function to unsubscribe.

## Function listenOptimizerProgress

This function lets you keep an eye on how your backtest optimization process is going. It provides updates as the optimization runs, letting you track the progress of data source processing. The updates are delivered in the order they happen, and even if your update handling involves some asynchronous work, it’s handled safely and sequentially to prevent any issues. You provide a function that will be called with progress information whenever an update is available. This way, you can display progress indicators or perform other actions based on the optimization's status.

## Function listenExit

This function lets you monitor for serious errors that halt the backtest-kit processes, like those running in the background. Think of it as a safety net for when things go really wrong and the process stops entirely.  Unlike the `listenError` function, this one deals with errors that aren’t recoverable and prevent further execution.  When a fatal error occurs, your provided callback function will be triggered to handle it, and importantly, it handles events one at a time, even if your callback involves asynchronous operations. This helps ensure stability and prevents unexpected behavior during these critical moments. You provide a function to be called when a fatal error happens, and this function returns another function that you can use to unsubscribe from listening to these errors later.

## Function listenError

This function lets you set up a listener that will be notified whenever a recoverable error occurs during your trading strategy's execution. Think of it as a safety net—if something goes wrong, like a failed API request, the strategy won't crash.

Instead, the error will be caught and passed to the function you provide. This allows you to handle the error, perhaps by retrying the action or logging the issue, while keeping the overall trading process running smoothly.

The errors are handled one at a time, in the order they happen, even if your error handling function needs to do something asynchronous. This ensures a predictable and controlled response to unexpected issues. The function returns an unsubscribe function allowing you to stop listening to these errors when no longer needed.

## Function listenDoneWalkerOnce

This function lets you react to when a background task within your backtesting strategy finishes, but it only triggers once. 

You provide a filter – a function that decides which completed tasks you care about – and a callback function that will run when a matching task finishes. 

Once the callback has executed, it automatically stops listening for further completion events, ensuring it doesn't interfere with other parts of your code. It's perfect for one-off tasks like cleaning up resources after a background operation.

## Function listenDoneWalker

This function lets you be notified when a background task within the backtest-kit framework finishes processing. Think of it as setting up a listener for when a specific process is done.

You provide a function that will be called when the background task completes, and this function returns another function that you can use to unsubscribe from the notifications later.

It’s important to know that even if your callback function takes some time to execute (like if it's doing some asynchronous operations), the notifications will still be processed one after another in the order they arrive, ensuring things happen in the right sequence.

## Function listenDoneLiveOnce

This function lets you react to when a background task finishes running. You provide a filter – a way to select which completed tasks you're interested in – and a callback function that gets executed just once when a matching task is done. Think of it as setting up a listener that only fires once for a specific kind of completed background operation, then quietly goes away afterward. This is useful for handling specific, one-time actions after a background process concludes.

You're essentially telling the system, "Hey, when this particular type of background job is finished, do this specific thing, and then don't bother me about it again."


## Function listenDoneLive

This function lets you keep track of when background tasks initiated by the Live system are finished. It's like setting up a notification system that alerts you when a process in the background is done. These notifications arrive in the order they complete, and even if your notification handler involves some processing, it will be executed one at a time to avoid any conflicts. You provide a function that gets called when a background task finishes, and this function returns another function that you can use to unsubscribe from these completion notifications later.

## Function listenDoneBacktestOnce

This function lets you react to when a background backtest finishes, but in a special way – it only triggers once. You provide a filter to specify which backtest completions you're interested in, and then a function that gets called when a matching backtest is done.  After that function runs once, the subscription is automatically removed, so you won't get any more notifications about that backtest's completion. It's a clean way to handle a single notification and then move on.


## Function listenDoneBacktest

This function lets you be notified when a background backtest finishes running. Think of it as setting up a listener that gets triggered once the backtest is complete. The notification includes details about the backtest's outcome. To ensure things run smoothly, even if your notification process involves some work (like asynchronous operations), the system handles the notifications in order, one at a time. This helps prevent any unexpected issues that might arise from multiple notifications happening simultaneously. You simply provide a function that gets executed upon completion, and the system takes care of the rest.


## Function listenBacktestProgress

This function lets you keep an eye on how your backtest is running. It's like setting up a notification system that tells you about the progress as the backtest executes. The updates you receive are processed one after another, even if the code you provide to handle them takes some time to run. This ensures the progress information is handled in a reliable and orderly fashion. You simply give it a function that will be called whenever a progress update is available.

## Function getMode

This function tells you whether the trading framework is currently running a backtest or operating in a live trading environment. It's a simple way to check the context of your code – are you analyzing historical data or executing trades in real-time? The function returns a promise that resolves to either "backtest" or "live", letting you adapt your strategies accordingly.


## Function getDefaultConfig

This function gives you a peek at the standard settings used by the backtest-kit. It returns a set of predefined values that control various aspects of the trading simulation, like how often to check for signals, acceptable slippage, and retry delays when fetching historical data. Think of it as a template – you can use this as a starting point when you want to customize the framework's behavior. By examining these defaults, you can understand the range of configurable parameters and how they influence the backtesting process.

## Function getDate

This function, `getDate`, provides a simple way to retrieve the current date within your trading strategy. It's versatile because it behaves differently depending on whether you're running a backtest or trading live. During a backtest, it gives you the date associated with the historical timeframe you're analyzing. When you’re trading live, it returns the actual, real-time date. Think of it as a reliable way to know what date your code is operating on.

## Function getConfig

This function lets you peek at the framework's global settings. It provides a snapshot of all the configuration values like retry counts, slippage percentages, and signal lifetimes. Importantly, it returns a copy of the settings, so you can examine them safely without changing the actual framework configuration. Think of it as a read-only view of how the backtest is set up.

## Function getCandles

This function allows you to retrieve historical price data, specifically candle data, from the trading platform. You provide the trading pair you're interested in, like "BTCUSDT" for Bitcoin against USDT, along with the time interval for the candles (e.g., "1m" for one-minute candles, "1h" for hourly candles).  You also specify how many candles you want to fetch from the past. The function then grabs this data from the connected exchange and returns it to you as an array of candle data points. It's a core function for analyzing past performance and building trading strategies.

## Function getAveragePrice

This function helps you figure out the average price of a trading pair, like BTCUSDT. It does this by looking at the volume and price movements over the last few minutes. Specifically, it calculates the Volume Weighted Average Price, or VWAP, which gives more weight to prices where more trading activity occurred. If there’s no trading volume to work with, it falls back to simply averaging the closing prices. You just need to tell the function which trading pair you're interested in.

## Function formatQuantity

This function helps you display the right amount of a cryptocurrency or asset when placing orders. It takes a trading symbol like "BTCUSDT" and a numerical quantity, then formats it correctly based on the rules of that specific exchange. This ensures the quantity shown to the user, or sent in an order, is accurate and adheres to the exchange’s requirements for decimal places. Think of it as a tool to automatically handle the sometimes tricky details of quantity formatting. It returns a formatted string ready for use.

## Function formatPrice

This function helps you display prices correctly for different trading pairs. It takes a symbol like "BTCUSDT" and a raw price value, and then formats the price according to the specific rules of that exchange. This ensures the price is displayed with the correct number of decimal places, making your trading platform look professional and accurate. Essentially, it handles the complex formatting details so you don't have to.

## Function dumpSignal

This function helps you save detailed records of your AI trading strategy’s decisions. It's particularly useful when your strategy uses a large language model to generate signals. It essentially creates a nicely formatted set of markdown files containing the conversation with the LLM, along with the resulting trading signal.

Each time you call it, a directory is created (or skipped if it already exists) to hold these files.  Inside, you'll find a file summarizing the system prompt, separate files for each user message in the conversation, and a final file showcasing the LLM's output including important details like the suggested entry price, take profit, and stop-loss levels.

You provide a unique identifier for the signal – this becomes the name of the directory where the logs are saved. You also pass in the conversation history and the generated signal itself. Optionally, you can specify a different directory for the output; otherwise, it will default to a folder named "dump/strategy" in your project.

## Function addWalker

This function lets you register a "walker" which is a way to run backtests for several different trading strategies simultaneously and then compare how they performed against each other. Think of it as setting up a system to automatically test multiple strategies on the same historical data and see which one comes out on top based on a metric you define. You provide a configuration object, the `walkerSchema`, to tell the backtest-kit how to run these comparisons. It's a core part of the framework for more in-depth, comparative analysis.

## Function addStrategy

This function lets you tell the backtest-kit framework about a trading strategy you want to use. Think of it as registering your strategy so the framework knows how to handle its signals and data. When you register a strategy, the framework will automatically check that the strategy's inputs and calculations are sound, preventing common errors. It also manages the frequency of signals to avoid overwhelming the system and ensures your strategy’s state is safely saved even if something unexpected happens during live trading. You provide a configuration object detailing the strategy’s rules and parameters to this function.

## Function addSizing

This function lets you tell backtest-kit how to determine the size of your trades. Think of it as setting up the rules for how much capital you’re willing to risk on each trade. You provide a configuration object that specifies things like whether you want to use a fixed percentage of your capital, a Kelly Criterion approach, or something based on Average True Range. It also allows you to set limits on the size of your positions and define how calculations are handled. Essentially, it's where you define your risk management strategy within the trading framework.

## Function addRisk

This function lets you define and register how your trading system manages risk. Think of it as setting the boundaries for how much your strategies can trade at once, and how you’re monitoring their collective exposure. You can specify limits on the total number of positions your strategies hold simultaneously. 

It also allows for more sophisticated checks, like monitoring portfolio metrics or considering correlations between different strategies. You can even create callbacks that are triggered when a trading signal is rejected or approved based on these risk checks.

Because multiple trading strategies share the same risk configuration, you get a system-wide view of risk, not just a strategy-by-strategy one. The system keeps track of all active positions, and this information is available to your validation functions to make informed decisions.

## Function addOptimizer

This function lets you register a custom optimizer to generate trading strategies within the backtest-kit framework. Think of an optimizer as a recipe that combines data, LLM interactions, and code templates to create a ready-to-run trading strategy. It gathers information from different sources, uses language models to refine the approach, and then produces a complete JavaScript file containing all the necessary components, like exchange settings, trading rules, and analysis logic.  Essentially, you provide a configuration object that defines how your optimizer works, and the framework will handle integrating it into the backtesting process.

## Function addFrame

This function lets you tell backtest-kit how to generate the timeframes it will use for your backtesting simulations. Think of it as defining the schedule for your backtest – specifying the start and end dates, and the interval (like daily, weekly, or hourly) at which data will be processed. You provide a configuration object that outlines these details, and the framework uses this to create the timeframes needed to run your tests. It essentially tells the system what periods of time you want to analyze.

## Function addExchange

This function lets you connect your backtest-kit framework to a new data source for trading – think of it as telling the system where to get historical price information. You provide a configuration object that defines how the framework should interact with that data source. The framework will then use this information to retrieve historical price data, format prices and quantities correctly, and even calculate indicators like VWAP, all based on the data from your connected exchange. This is a key step in setting up your backtesting environment.


# backtest-kit classes

## Class WalkerValidationService

This service helps you keep track of and check your walker configurations, which are used for things like optimizing strategies or tuning hyperparameters. It acts like a central hub for all your walkers, making sure they're set up correctly before you start running tests.

You can add new walker configurations using `addWalker`, and the service will remember them. Before using a walker in your backtesting process, you should use `validate` to confirm it exists and is properly defined. `list` is a convenient way to see all the walkers you've registered. 

The service also keeps a record of validation results, which speeds things up by avoiding unnecessary checks. It's designed to make managing your walker configurations simpler and more reliable.

## Class WalkerUtils

WalkerUtils provides helpful tools for managing and running trading walkers within the backtest-kit framework. Think of it as a simplified way to interact with your walkers, handling details like retrieving data and generating reports.

It provides a single, easy-to-access instance for running walker comparisons. The `run` method allows you to execute a walker and receive its results step-by-step, while `background` lets you run a walker in the background without needing to process each individual update—ideal for tasks like logging or triggering callbacks.

You can also use `stop` to pause a walker’s signal generation, ensuring it gracefully completes any existing signals before stopping.  `getData` retrieves all the data collected from your walker's strategy comparisons, and `getReport` creates a nicely formatted markdown report summarizing the results.  Finally, `dump` allows you to save this report to a file, and `list` provides a quick overview of all your active walkers and their current status.

## Class WalkerSchemaService

The WalkerSchemaService helps you keep track of your trading strategies, or "walkers," in a well-organized and type-safe way. Think of it as a central place to store and manage the blueprints for your trading logic.

It uses a special registry to ensure everything is consistent and that the strategies you define follow a specific structure.  You add new strategies using `addWalker()`, effectively registering them in this system. 

When you need to use a particular strategy, you can easily retrieve it by its name using `get()`. 

Before a new strategy is added, `validateShallow` checks to make sure it has all the necessary pieces in place. If a strategy already exists, `override` lets you update specific parts of it without completely replacing the whole thing. This service is designed to make managing your trading strategies much more reliable and less prone to errors.

## Class WalkerMarkdownService

This service is designed to automatically create and save reports about your trading strategies as they're being tested. It listens for updates from your trading simulations and organizes the results in a way that's easy to understand.

Think of it as a way to track how different strategies perform side-by-side. It generates nicely formatted markdown tables, allowing for a clear comparison of results. These reports are then saved to files, making it easy to review performance over time.

The service manages results separately for each trading simulation (walker), ensuring that each one has its own dedicated report.  You can clear out old results if you want to start fresh, either for a specific simulation or for all of them. The initialization happens automatically when you start using the service, so you don't have to worry about setting things up manually.


## Class WalkerLogicPublicService

The WalkerLogicPublicService acts as a central point for managing and running your trading strategies, making it easier to keep track of everything. It builds upon a private service, automatically handling important details like the strategy name, exchange, frame, and walker name as it runs.

Think of it as a helper that simplifies the process of executing backtests across different strategies.

The `run` method is key – it allows you to kick off a comparison of walkers for a specific trading symbol, automatically passing along essential context information. This means you don’t have to manually specify these details each time, saving you time and reducing errors.

## Class WalkerLogicPrivateService

This service manages the process of comparing different trading strategies, a bit like orchestrating a race between them. It takes a symbol, a list of strategies you want to compare, the metric you’re using to judge their performance (like profit or Sharpe ratio), and some contextual information about the trading environment.

The comparison happens step-by-step: it runs each strategy one after another and provides updates on their progress as they finish.  During this process, it keeps track of the best-performing strategy based on the chosen metric.

Finally, once all strategies have been tested, it returns a ranked list of the strategies, so you can easily see which performed best. It relies on other services internally to handle the individual backtesting and formatting of the results.

## Class WalkerCommandService

The WalkerCommandService acts as a central hub for interacting with the walker functionality within the backtest-kit framework. Think of it as a convenient way to access various services needed for running and validating your trading strategies. 

It simplifies dependency injection, making it easier to incorporate walker features into your code. It’s designed to be the primary entry point for public API exports.

The service bundles together several underlying services, including those for managing walker logic, schemas, validations for strategies, exchanges, frames, walkers, strategy schemas, risk, and a logger. 

The key function, `run`, allows you to execute a walker comparison for a specific trading symbol and provides context, such as the walker, exchange, and frame names, to the comparison process. This function returns an asynchronous generator, allowing you to process results incrementally.

## Class StrategyValidationService

This service helps you keep track of your trading strategies and make sure they’re set up correctly. It acts like a central hub where you register each strategy you're using.

You can add new strategies using `addStrategy`, providing a name and its configuration details. Before you start trading, you can use `validate` to double-check that a strategy exists and, if you’re using them, that its associated risk profiles are also valid.

If you need to see all the strategies you've registered, the `list` function will give you a complete list. The service remembers validation results to speed things up – it won't re-validate strategies unnecessarily. It relies on a logger service and a risk validation service for logging and risk profile checks respectively, and internally uses a map to store strategy information.

## Class StrategySchemaService

The StrategySchemaService helps keep track of your trading strategy definitions in a structured and organized way. It acts like a central repository where you can register, retrieve, and even update your strategy blueprints.

Think of it as a way to safely store the instructions for your trading strategies, ensuring they have the correct ingredients and are set up properly. You add new strategies using `addStrategy()`, find them later by name using `get()`, and make sure they're well-formed with the help of validation checks.

It uses a special system (`ToolRegistry`) to keep things type-safe, meaning it helps prevent errors by making sure everything is the right type. You can also modify existing strategies with `override()`, applying partial updates without replacing the whole definition.

## Class StrategyCoreService

The StrategyCoreService acts as a central hub for managing and running trading strategies within the backtest kit. It combines several services to provide a convenient way to interact with strategies and ensure they have the necessary context, like the trading symbol and timestamp.

This service handles validating strategies, retrieving pending signals for monitoring purposes (like stop-loss and time expirations), and checking if a strategy is currently stopped. You’re also able to run quick backtests against historical candle data and stop a strategy from generating new signals.

It also includes a mechanism to clear cached strategy data, which is useful for forcing a strategy to re-initialize. Essentially, it simplifies the process of working with strategies, especially within the backtesting environment.

## Class StrategyConnectionService

This service acts as a central hub for managing and executing your trading strategies. It intelligently routes requests to the correct strategy instance based on the symbol and strategy name you specify. To boost performance, it remembers which strategy instances it’s already created and reuses them whenever possible.

Before you can run a strategy, you're required to initialize it.  This service ensures that initialization happens before any live or backtesting operations are performed.

You can use this service to perform live trading using the `tick` function, or to run backtests against historical data with the `backtest` function. The `stop` function allows you to halt a strategy's signal generation, and `clear` provides a way to reset or release resources associated with a strategy. It also offers convenient methods like `getPendingSignal`, `getStopped`, which allows you to get the state of the running strategy.

## Class SizingValidationService

This service helps you keep track of your position sizing strategies and make sure they're set up correctly before you start trading. Think of it as a central place to register your sizing methods, like fixed percentage or Kelly Criterion, and verify they're available. 

You can add sizing strategies using `addSizing`, and `validate` lets you quickly confirm a specific strategy exists. To improve efficiency, the service remembers past validation results. Finally, `list` gives you a simple way to see all the sizing strategies currently registered.

## Class SizingSchemaService

This service helps you organize and manage your sizing schemas, which are essentially blueprints for how much to trade. It uses a secure and type-safe way to store these schemas, ensuring they’re consistent and reliable.

You can add new sizing schemas using `register` and update existing ones with `override`.  If you need to fetch a specific sizing schema, just use the `get` method, providing the schema's name to retrieve it.

Under the hood, it validates each schema to make sure it has all the necessary elements before saving it. The `validateShallow` property handles this validation process. 

The service also keeps track of its activity with a logger, ensuring you can monitor its operations.

## Class SizingGlobalService

This service handles the logic for determining how much of an asset to buy or sell, often referred to as position sizing. It acts as a central point for these calculations, coordinating with other services to ensure accurate and validated results.

Essentially, it takes information about your risk tolerance and the trade you want to make, and figures out the appropriate size for that trade. It's a key component for making sure your trading strategy adheres to your defined risk management rules.

The service relies on a connection service for underlying data and a validation service to ensure sizing requests are reasonable. 

You'll find it used internally within the backtest-kit framework and also exposed for use in custom strategies.


## Class SizingConnectionService

The SizingConnectionService helps manage how position sizes are calculated within your trading strategy. It acts as a central hub, directing sizing requests to the correct sizing method based on a name you provide. 

Think of it as a smart router – you tell it which sizing method you want to use (like fixed percentage or Kelly criterion), and it handles finding and using the right tool for the job. It's designed to be efficient, remembering which sizing methods you've already used so it doesn't have to recreate them every time.

The service takes into account your risk parameters and uses the chosen method to determine the ideal position size. If you're using a strategy without any specific sizing rules, the sizingName parameter will be empty.

You can access sizing methods through the `getSizing` property and calculate sizes using the `calculate` method, which handles the routing and calculation process for you.

## Class ScheduleUtils

ScheduleUtils helps you keep track of your scheduled trading signals and understand how well they're performing. Think of it as a central place to monitor signals that are planned to execute at specific times. 

It provides ways to gather statistics about these signals, such as how many are in the queue, how many are being cancelled, and how long they're waiting.  You can easily get a summary of the signal events for a specific trading symbol and strategy.

Furthermore, ScheduleUtils can automatically create readable markdown reports that detail the scheduled signals, making it easier to analyze performance and identify potential issues. Finally, you can save these reports directly to a file for later review. It's designed to be a simple, readily available tool – there's only one instance of it available for your use.

## Class ScheduleMarkdownService

This service automatically generates and saves reports about your scheduled trading signals. It keeps track of when signals are scheduled and when they are cancelled, organizing the data by strategy and the asset being traded. 

The service builds markdown tables summarizing these events, including useful statistics like the cancellation rate and average wait times. These reports are stored as `.md` files in the `logs/schedule/` directory.

To use it, you don't need to explicitly start it—the service initializes itself automatically when needed. You can retrieve statistical data or generate reports for specific strategies and assets using its functions. It also provides a way to clear the collected data, either for a single strategy/asset combination or all data at once.

## Class RiskValidationService

This service helps you keep track of your risk management settings and make sure they're all set up correctly before your trading strategies run. Think of it as a central place to register and check your risk profiles.

You can add new risk profiles using `addRisk`, and the service will remember them. Before you use a risk profile, you can use `validate` to double-check it exists, preventing errors. It’s designed to be efficient, caching validation results to avoid repetitive checks. If you need to see what risk profiles you've registered, the `list` function gives you a complete overview. The service also uses a logger to help with troubleshooting.

## Class RiskSchemaService

The RiskSchemaService helps you keep track of your risk profiles in a structured and reliable way. It acts as a central place to store and manage these profiles, ensuring they are consistent and easy to access. 

Think of it like a well-organized filing system for your risk assessments. You can add new risk profiles using the `addRisk()` method (represented here as `register`) and retrieve them later by their name using `get()`.  Before a new risk profile is added, the `validateShallow()` method checks it to make sure it has all the necessary information and is set up correctly. If you need to make changes to an existing risk profile, you can use the `override()` method to update it with just the parts that need changing. The service uses a special tool to keep everything type-safe, meaning it helps prevent errors and ensures that your risk profiles are always in the expected format.

## Class RiskGlobalService

This service handles risk management operations, acting as a central point for validating and tracking signals against pre-defined risk limits. It relies on a connection service to interact with the risk system itself and a validation service to check configurations.

The service keeps a log of its activities and uses memoization to avoid unnecessary validation checks. 

You can use it to check if a signal should be executed based on the current risk limits, register newly opened signals with the risk system, or remove signals when they're closed.  It also provides a way to clear all risk data or just data for a specific risk instance, giving you control over the risk management system's state.

## Class RiskConnectionService

The RiskConnectionService acts as a central point for managing risk checks within your trading strategy. It figures out which specific risk implementation to use based on a name you provide, ensuring the right rules are applied.

To make things efficient, it remembers previously used risk implementations, so it doesn't have to recreate them every time.  This caching significantly speeds up the risk checking process.

You can use it to verify whether a trade should be allowed, register new trades, and remove completed trades from the risk system.  If your strategy doesn’t have any specific risk settings, you can leave the risk name blank.

The service also provides a way to manually clear its memory of previously used risk implementations when needed.

## Class PositionSizeUtils

This class offers helpful tools for determining how much of your capital to allocate to a trade. It provides pre-built functions for different position sizing strategies, making it easier to implement them in your trading system. 

You’ll find methods for calculating position size based on fixed percentages of your account balance, the Kelly Criterion (which considers win rates and win/loss ratios), and the Average True Range (ATR) to account for volatility. Each method is designed to validate the provided information to ensure the calculation is accurate and appropriate for the chosen sizing technique. Think of it as a toolkit to help you systematically manage your risk when entering trades.

## Class PersistSignalUtils

This utility class helps manage how trading signals are saved and loaded, particularly for strategies running in live mode. It ensures that signal data is stored reliably, even if the system crashes unexpectedly. 

The class handles storing signal data for each strategy individually and provides a way to customize how this storage happens by letting you plug in your own persistence adapters. When a strategy starts, it can load previously saved signal data to continue where it left off, and when a new signal is calculated, this class writes it to disk. 

The `readSignalData` function retrieves saved signal information, while `writeSignalData` stores the new signal data using a method that minimizes the risk of data loss due to crashes. Think of it as a safe and organized way to keep track of your strategy's decisions over time.

## Class PersistScheduleUtils

The PersistScheduleUtils class is designed to help manage how scheduled signals are saved and retrieved for your trading strategies. Think of it as a helper that keeps track of your signals so they aren't lost if something unexpected happens.

It automatically manages where these signals are stored for each strategy, allowing you to customize the storage mechanism if needed.  The class ensures that saving and loading these signals is done reliably, even if your application crashes during the process.

When your strategy starts, it uses this class to load any existing scheduled signals.  If you change a scheduled signal, the class handles saving it safely to disk.  The whole process is designed to prevent data corruption and maintain a consistent state for your trading activities.

You can even swap out the default storage method with your own custom adapter if you require a different approach.

## Class PersistRiskUtils

This utility class helps manage how your active trading positions are saved and restored, particularly for different risk profiles. It's designed to ensure a reliable and crash-safe way to keep track of your positions.

The class automatically handles the storage of your position data, creating separate storage areas for each risk profile and allowing you to use your own custom storage methods if needed.  

When your system starts up, `readPositionData` retrieves the saved positions for a specific risk profile, returning an empty set if no data is found.  Conversely, `writePositionData` saves the active positions to disk, guaranteeing that changes are written atomically, meaning they're saved as a single, complete unit, to prevent data loss if something goes wrong during the save process.

You can also customize the way this persistence works by registering your own adapter with `usePersistRiskAdapter`, allowing you to integrate with specific storage solutions.

## Class PersistPartialUtils

The PersistPartialUtils class helps manage how partial profit and loss information is saved and retrieved, particularly for live trading scenarios. It ensures that your trading system can recover its state even if something unexpected happens.

The class automatically handles storing these partial data points separately for each trading symbol. You can even customize how this storage works by plugging in your own adapter.

When your system starts up, `readPartialData` fetches any previously saved profit and loss levels. After your system makes changes to these levels, `writePartialData` reliably saves them to disk, making sure the save operation is safe from interruptions.

If you need a different way to store this data, `usePersistPartialAdapter` allows you to register a custom storage mechanism.

## Class PerformanceMarkdownService

This service helps you understand how your trading strategies are performing. It gathers data about your strategies as they run, tracking key metrics like average returns, maximum drawdowns, and other important statistics.

Think of it as a central hub that listens for performance updates and organizes them for each strategy you're using, broken down by the trading symbol. It then automatically creates easy-to-read markdown reports that highlight potential areas for improvement or bottlenecks.

You can retrieve all the performance data for a specific strategy and symbol, generate performance reports on demand, and save those reports directly to your logs. To keep things organized, the service ensures initialization happens only once and provides a way to clear out all accumulated data when needed.

## Class Performance

The Performance class helps you understand how your trading strategies are doing by providing tools to analyze their performance. You can easily retrieve aggregated statistics for a specific trading symbol and strategy to see things like total execution time, average durations, and volatility. 

Want a more detailed view? The `getReport` method creates a nicely formatted markdown report that breaks down performance by operation type and highlights potential bottlenecks using percentile analysis. 

Finally, if you want to save those reports for later review or sharing, the `dump` method allows you to save the generated markdown report to a specified location on your computer, creating any necessary directories along the way.

## Class PartialUtils

The PartialUtils class helps you analyze and report on partial profit and loss data collected during backtesting or live trading. Think of it as a tool to inspect how your strategies are performing on a micro level – looking at individual profit and loss events.

You can use it to get summarized statistics like total profit/loss counts for a specific symbol and strategy.  It can also create nicely formatted markdown reports that display all the partial profit/loss events in a table, showing details like the action taken (profit or loss), the symbol traded, the strategy used, the position size, the level percentage, the price at the time, and the timestamp.

Finally, this class allows you to easily save those reports to a file on your disk as a markdown document, making it simple to share or archive your partial profit/loss analysis. The file will be named using the symbol and strategy name, for example, "BTCUSDT_my-strategy.md".

## Class PartialMarkdownService

This service helps you track and report on your partial profits and losses. It listens for events related to profits and losses, keeping a record of them for each trading symbol and strategy you use.

You can request summary statistics or a complete markdown report detailing each event for a specific symbol and strategy. The service also allows you to save these reports as files on your disk, organized by symbol and strategy name. 

The service manages its own storage for each combination of symbol and strategy, ensuring that data is kept separate. It's designed to initialize automatically when needed and can be cleared if you want to reset the data it’s tracking.

## Class PartialGlobalService

The PartialGlobalService acts as a central hub for managing and tracking partial profit and loss events within the backtesting system. It simplifies how strategies interact with the underlying connection layer by providing a single injection point and a consistent way to log actions.

Think of it as a middleman: when a strategy needs to record a profit, loss, or clear a position, it goes through the PartialGlobalService. This service logs the event for monitoring purposes and then passes the request on to the PartialConnectionService to handle the actual changes.

The service relies on other injected components like a logger, a connection service, and validation services to perform its tasks. It also includes a caching mechanism to avoid repeated validation checks.

Specifically, the `profit` and `loss` functions are used to register profit and loss events, while the `clear` function resets the partial state when a trade is closed.

## Class PartialConnectionService

This service manages how your trading system tracks partial profits and losses for each individual signal. It's designed to be efficient, creating and storing just one tracking object for each signal ID.

Think of it as a factory – whenever your strategy needs to record a partial profit or loss, this service will either create a new tracking object or find an existing one. These tracking objects handle the actual recording of profit and loss data, as well as triggering events that your system can react to.

When a signal is closed, this service cleans up those tracking objects to prevent memory buildup. It also utilizes a system that remembers previously created objects, so it doesn't need to recreate them every time. This service works closely with your overall trading strategy to ensure accurate and timely tracking of partial results.

## Class OutlineMarkdownService

This service helps create documentation in Markdown format, particularly useful for debugging and understanding how AI-powered trading strategies are working. It's designed to capture important information like system prompts, user inputs, and the final output from the AI model. 

The service automatically organizes this data into a structured directory, creating separate files for each key piece of information, allowing you to easily review the conversation flow and the reasoning behind trading decisions. It avoids accidentally overwriting previous results by checking if the directory already exists before writing.

You're given a logger service to help with diagnostics, and the core functionality revolves around dumping signal data and conversation history into those organized Markdown files.

## Class OptimizerValidationService

This service helps ensure that the optimizers you're using are properly registered and available for your backtesting framework. Think of it as a central directory for your optimizers.

It keeps track of all registered optimizers, allowing you to easily check if a particular optimizer is recognized. To prevent errors, it makes sure you don't accidentally register the same optimizer multiple times.

The service remembers previous validation checks to speed things up if you need to validate the same optimizer again.

You can add new optimizers to the registry, view a list of all registered optimizers, and use the validation function to confirm an optimizer exists.

## Class OptimizerUtils

OptimizerUtils provides helpful tools for working with trading strategies generated by the backtest-kit framework. It allows you to retrieve strategy data, generate the actual code for those strategies, and save that code to files for later use. 

You can use `getData` to gather information about your strategies, including details from their training data and conversation histories.  `getCode` then takes that information and creates a complete, runnable code file containing all the necessary components. Finally, `dump` makes it easy to save the generated code to a file on your system, automatically creating any necessary directories.

## Class OptimizerTemplateService

This service helps automate the creation of code snippets for your trading strategies, leveraging the power of large language models (LLMs) and integrating with various tools. It acts as a central point for generating different parts of your trading system, like exchange configurations, timeframe setups, and even the strategies themselves.

The system can analyze data across multiple timeframes (1-minute, 5-minute, 15-minute, and 1-hour) and structure the results as JSON for clear signal generation. It's built to work with CCXT exchanges, especially Binance, and simplifies the process of comparing different trading strategies using a “walker” approach.

For debugging, it provides tools to save conversations and results to a dedicated directory. It also incorporates specific functions for text and JSON generation, utilizing the Ollama platform and a deepseek model for market analysis and structured trading signal creation – signals including details like entry price, take profit, stop loss, and estimated duration. You can customize some aspects of the service through your optimizer schema configuration.

## Class OptimizerSchemaService

The OptimizerSchemaService helps you keep track of and manage the configurations for your optimizers. Think of it as a central place to store and validate these configurations, ensuring they're set up correctly.

It uses a registry to securely hold onto these configurations, preventing accidental changes. 

You can register new optimizer configurations using the `register` function, which will also check to make sure you’re providing all the necessary information. The `validateShallow` function provides a quick check of the configuration’s basic structure.

If you need to update an existing configuration, the `override` function lets you modify specific parts of it without replacing the entire configuration. Finally, `get` lets you easily retrieve a specific optimizer configuration by its name.

## Class OptimizerGlobalService

The OptimizerGlobalService acts as a central point for interacting with optimizers, ensuring everything is done correctly. It's like a gatekeeper that first records what you’re trying to do, then checks if the optimizer you're referencing actually exists before passing the request along to handle the details.

You can use it to retrieve strategy data, generate code, or save the generated code to a file. It provides methods to get data (`getData`), create executable code (`getCode`), and dump code to disk (`dump`), all while keeping things validated and secure. Think of it as a convenient and safe way to work with your trading strategies.


## Class OptimizerConnectionService

The OptimizerConnectionService helps you work with trading optimizers in a clean and efficient way. It acts as a central hub for creating and managing these optimizers, remembering the ones you've already created so you don't have to rebuild them every time.

It intelligently combines your custom optimizer settings with default configurations, making it easier to personalize your trading strategies. You can inject logging to monitor the optimizer's behavior.

The `getOptimizer` method is your go-to for retrieving an optimizer; it's designed to be quick thanks to its caching capabilities.

`getData` pulls together information from various sources and organizes it into strategy metadata.

`getCode` builds the complete code needed to execute a trading strategy.

Finally, `dump` simplifies the process of saving generated strategy code directly to a file.

## Class LoggerService

The LoggerService helps you keep your backtesting logs organized and informative. It handles adding extra details to your log messages automatically, such as which strategy, exchange, and frame are being used, as well as the symbol, timestamp, and whether it's a backtest. This eliminates the need to manually add this context information each time you log something. 

If you don't provide your own logging solution, it will default to a "do nothing" logger. 

You can customize the service by setting your own logger implementation using the `setLogger` method. It internally manages services related to the method and execution context. The core functionality is exposed through `log`, `debug`, `info`, and `warn` methods, all of which include automatic context injection.

## Class LiveUtils

LiveUtils provides helpful tools to manage live trading operations. It acts as a central place to easily start, monitor, and stop live trading runs.

The `run` method is the primary way to kick off live trading; it generates a stream of results indefinitely and handles potential crashes by automatically restoring from saved data.  You can also use `background` to run live trading silently in the background, useful for tasks like data persistence or triggering external callbacks.

To stop a live trading run, use the `stop` method, which prevents new signals from being generated while allowing existing trades to finish.  You can check the current status of your live trading instances with `list`, retrieve statistical data with `getData`, or generate a detailed report with `getReport`. Finally, the `dump` function allows you to save these reports to disk for later review.

## Class LiveMarkdownService

This service helps you automatically create reports detailing your trading activity. It listens to every tick event, keeping track of what's happening with each strategy you're using. The reports are formatted as easy-to-read markdown tables, and include important statistics like win rate and average profit.

The service saves these reports to disk, organized by the symbol and strategy name, so you can easily review them later. You don't even need to explicitly start it – it's designed to automatically initialize itself when needed.

It uses a clever storage system, creating a separate space for each combination of symbol and strategy, ensuring your data is isolated. You can also clear the accumulated data if you need to, either for a specific strategy or all of them.

## Class LiveLogicPublicService

This service helps manage and execute live trading, making it easier to work with different strategies and exchanges. It cleverly handles the background details of keeping track of things like strategy and exchange names, so you don't have to pass them around constantly in your code.

Think of it as a continuous, never-ending stream of trading events – it runs indefinitely, providing a constant flow of data. It's designed to be resilient; if something goes wrong and the process crashes, it can automatically recover and pick up where it left off, using saved data. 

You provide the symbol you want to trade, and it takes care of the rest, providing a steady stream of signals as it progresses in real-time, using the current date and time.


## Class LiveLogicPrivateService

The `LiveLogicPrivateService` helps you run live trading strategies continuously, like a tireless monitor watching the markets. It works by constantly checking for trading signals, and it sends you updates only when a trade is opened or closed – it skips over periods of inactivity to keep things efficient. 

Think of it as an infinite loop that streams trading results to you. This setup is designed to be resilient; if something goes wrong and the process crashes, it will automatically recover and resume trading from where it left off. 

You provide the symbol you want to trade, and the service handles the ongoing execution, giving you a steady flow of relevant trading information. It utilizes services for logging, core strategy execution, and method context to ensure everything runs smoothly.

## Class LiveCommandService

This service acts as a central point for accessing live trading features within the backtest-kit framework. Think of it as a convenient way to inject dependencies needed for live trading.

It handles the core logic and provides access to various validation services, like those ensuring your strategy and exchange configurations are valid. 

The key function is `run`, which initiates the live trading process for a specific trading symbol, and continuously generates results – opening and closing trade data – while also automatically attempting to recover from any potential issues. It's designed to keep trading going smoothly.


## Class HeatUtils

HeatUtils helps you visualize and understand how your trading strategies are performing. Think of it as a tool to create clear, insightful reports showing the profitability and risk characteristics of each asset your strategy has traded.

It simplifies getting the data needed for these reports, automatically gathering statistics from all your completed trades for a specific strategy. You can easily request the raw data or generate a ready-to-read markdown table showing key metrics like total profit, Sharpe ratio, and maximum drawdown, sorted by profitability. 

Furthermore, it allows you to save these reports directly to a file on your computer, making it easy to share your results or track performance over time. HeatUtils acts as a central, accessible resource for portfolio heatmap analysis.

## Class HeatMarkdownService

The Heatmap Service helps you visualize and analyze the performance of your trading strategies. It takes data from your signal emitter and automatically compiles it into clear, understandable reports. 

Think of it as a central hub for monitoring how your strategies are doing – you can see overall portfolio metrics, or dive into the details for each individual asset. It produces easy-to-read Markdown tables, and handles calculations carefully to avoid errors with potentially tricky numbers.

Each strategy gets its own dedicated space for storing data, so you can easily compare them. The service creates and manages this storage for you. It also automatically generates and saves reports to disk, making it easy to track progress over time. 

You don't even need to manually start it; the service initializes itself the first time you use it. You can clear the data if needed, either for a specific strategy or all of them at once.

## Class FrameValidationService

This service helps you keep track of your trading timeframes and make sure they're properly set up. Think of it as a central place to register all the different timeframes your strategies use.

You can add new timeframes using `addFrame`, providing a name and a description of its structure. Before your strategies try to use a specific timeframe, `validate` checks if it’s been registered, preventing errors down the line. To avoid repetitive checks, the service remembers the results of validations using a clever caching technique. 

If you need to see all the timeframes you've registered, `list` provides you with a simple way to view them. This service ensures that you have a well-organized and reliable framework for managing your timeframes.

## Class FrameSchemaService

The FrameSchemaService helps you keep track of your trading frame schemas in a structured and type-safe way. Think of it as a central place to store and manage the blueprints for your trading frames.

It uses a special registry to ensure that the schemas you're using are consistent and have the information they need. You can add new frame schemas using `register()`, update existing ones with `override()`, and get a schema by name using `get()`. 

Before a schema is added, it’s checked with `validateShallow` to make sure it has all the essential properties set up correctly. This helps prevent errors later on. The service also keeps a log of what’s happening via its `loggerService`.

## Class FrameCoreService

The FrameCoreService acts as a central hub for managing timeframes within the backtesting process. It works closely with the FrameConnectionService to generate the specific date ranges needed for your backtest. Think of it as the engine that provides the sequence of time periods your trading strategies will be evaluated against.  It also includes a validation service to ensure the data is usable. 

The `getTimeframe` function is the key method, allowing you to request a timeframe array for a specific trading symbol and timeframe name, like "daily" or "hourly." This function returns a Promise that resolves to an array of dates representing the timeframe.  It's the primary way to get the timeline data you need.


## Class FrameConnectionService

The FrameConnectionService acts as a central hub for working with different trading frames, like minute, hourly, or daily data. It automatically figures out which frame implementation to use based on the current trading context. 

To improve performance, it keeps a record of previously created frames, so it doesn't have to recreate them every time you need one.  

You can use it to get a specific frame using the `getFrame` method, providing the frame name like "1m" or "1h". 

The `getTimeframe` method allows you to define a specific period for backtesting, retrieving the start and end dates based on the frame configuration. When in live mode, the frame name is blank, meaning no specific frame constraints are applied.

## Class ExchangeValidationService

This service acts as a central point for keeping track of your trading exchanges and making sure they’re properly set up. Think of it as a quality control system for your exchanges.

You use `addExchange` to register each exchange you’re using, providing its configuration details.  Before you try to actually trade on an exchange, use `validate` to confirm it’s correctly registered – it’s a quick safety check. 

Need to see all the exchanges you've registered? The `list` function gives you a simple list of all of them. The system remembers validation results to make things faster.

## Class ExchangeSchemaService

This service acts as a central place to store and manage details about different cryptocurrency exchanges – think of it as a database specifically for exchange information. It uses a system designed to prevent errors by ensuring the data types are correct.

You can add new exchange information using the `addExchange()`-like functionality, and retrieve existing exchange details by their unique name. 

Before a new exchange is added, a quick check ensures that all the essential information is present and in the expected format.

If an exchange already exists, you can update parts of its information using the `override` function, which allows you to make targeted changes without replacing the entire exchange definition.

## Class ExchangeCoreService

This service acts as a central hub for interacting with an exchange within the backtesting framework. It combines connection to the exchange with the ability to inject relevant information like the trading symbol, time, and backtest settings into each operation.

Internally, it manages the connection to the exchange and provides validation functionality, ensuring configurations are correct and avoiding unnecessary re-validation. 

You’re able to retrieve historical candle data, and crucially, simulated future candle data when running a backtest. There are also methods to calculate average prices and format both prices and order quantities, all with the ability to incorporate execution context.

## Class ExchangeConnectionService

This service acts as a central point for interacting with different cryptocurrency exchanges. It automatically directs your requests to the correct exchange based on the context of your trading logic.

To improve efficiency, it keeps a record of the exchange connections it creates, so it doesn't have to establish a new connection each time you need to use it.

You can use it to retrieve historical price data (candles), get the next set of candles after a certain point in time, find the average price of a symbol, and properly format prices and quantities to align with the rules of the specific exchange you’re using. It handles the complexities of connecting to and interacting with various exchanges, allowing you to focus on your trading strategy.


## Class ConstantUtils

This class provides a set of pre-calculated percentages used for setting take-profit and stop-loss levels, designed around the Kelly Criterion and an approach that gradually reduces risk. Think of it as a guide to help you define levels that automatically adjust based on how far the price has traveled toward a defined profit or loss target.

Each level – TP_LEVEL1, TP_LEVEL2, TP_LEVEL3 for take profits, and SL_LEVEL1, SL_LEVEL2 for stop losses – represents a specific percentage of the total distance to the ultimate target. For example, TP_LEVEL1 (30) means that when the price moves 30% of the way to your overall profit target, a partial profit is locked in. SL_LEVEL2 (80) indicates the point where you exit most of your position to avoid a substantial loss. These levels offer a structured way to manage your positions by taking profits and limiting losses in stages.

## Class ConfigValidationService

This service helps ensure your trading configurations are mathematically sound and have the potential to be profitable. It meticulously checks your global settings, paying close attention to percentages like slippage and fees, making sure they're all positive values. It also verifies that your minimum take-profit distance is sufficient to cover trading costs, guaranteeing a chance at profit when a trade reaches its target. 

Beyond percentages, the service examines relationships between settings like stop-loss distances, and confirms that time-related values and retry counts are positive integers. Essentially, it acts as a safety net, catching potential errors in your configurations before they can lead to unexpected or unprofitable trading behavior. It uses a logger service to report any validation issues it finds. The validation process itself is triggered by the `validate` method.

## Class ClientSizing

This component, ClientSizing, figures out how much of your assets to allocate to a trade. It's designed to be flexible, letting you choose from different sizing approaches like a fixed percentage, the Kelly Criterion, or using Average True Range (ATR). You can also set limits on the minimum and maximum position size, and restrict the maximum percentage of your portfolio that can be used for a single trade. 

It’s easy to customize—you can even include callback functions for verifying the calculated size and keeping a log of the process. The `calculate` method is the core of this component; it's what actually computes the position size based on the settings and constraints you’ve provided.

## Class ClientRisk

The ClientRisk component helps manage risk across your entire trading system, ensuring signals don’t violate pre-defined limits. It’s designed to work with multiple strategies simultaneously, allowing you to analyze and control risk holistically. 

It keeps track of active positions, built from data fetched on first use and optionally persisted for later use – persistence is skipped during backtesting. The `checkSignal` method is key, it evaluates each signal before a position is opened, using information about the signal itself and all currently held positions. 

When a strategy opens or closes a position, the `addSignal` and `removeSignal` methods update the system's record of active positions, ensuring an accurate view of your portfolio's risk profile.

## Class ClientOptimizer

This class helps manage the optimization process, acting as a bridge between the overall optimization system and the actual data and code generation. It gathers data from various sources, handles pagination for large datasets, and prepares this information for use by an LLM. 

The optimizer constructs detailed conversation histories, essential for guiding the LLM's code generation. It combines templates to build a complete, runnable strategy, including all necessary components like imports, helpers, and the actual trading logic. 

Finally, this class provides a convenient way to save the generated strategy code to a file, automatically creating directories if they don't exist. The output is a standard JavaScript module (.mjs) ready for use.

## Class ClientFrame

The `ClientFrame` component is designed to create the timeline of data your backtesting process will use. Think of it as the engine that spits out the sequence of timestamps for your trading simulations. It's built to be efficient – once a timeline is generated, it's saved so you don't have to recreate it every time.

You can customize how far apart these timestamps are, from one-minute intervals to three-day gaps. It also provides ways to hook in custom logic for validating the generated timeframe and recording important information. The `ClientFrame` works closely with the backtesting engine itself, driving the historical period iterations.

The core functionality is the `getTimeframe` method, which produces the array of dates your backtest will run against; this method remembers the results for speed.

## Class ClientExchange

This `ClientExchange` component is your connection to real or simulated exchange data. It allows you to retrieve historical and future price data, calculate average prices like VWAP, and properly format quantities and prices according to the specific exchange's rules. When backtesting, it’s especially helpful for getting candles needed for generating and evaluating trading signals. Retrieving historical candles looks backward in time, while fetching future candles is designed to work forward for backtesting scenarios. The VWAP calculation uses the last few 1-minute candles to determine the volume-weighted average price, providing a useful measure of price movement. Quantity and price formatting ensures that data is presented in the correct format for the exchange.

## Class BacktestUtils

This utility class simplifies running backtests and gathering results. It provides a convenient way to execute backtest simulations for a specific symbol and strategy combination, ensuring each pairing has its own isolated environment. 

You can easily run a backtest and receive its results step-by-step, or run them in the background when you only need side effects like logging.  It also allows you to stop a backtest in progress, preventing the strategy from generating new signals while allowing existing ones to complete. 

Furthermore, you can retrieve statistical data and a nicely formatted markdown report summarizing the results of past simulations, or list all running backtest instances and their current status. Finally, backtest reports can be saved directly to disk for later review.

## Class BacktestMarkdownService

This service helps you create reports summarizing your backtest results in a readable markdown format. It listens for trading signals during a backtest and keeps track of the closed trades for each strategy you're testing. 

Think of it as an automatic reporter that organizes your backtest data into tables and saves them as `.md` files in a `logs/backtest` directory. Each strategy's performance will be detailed in its own report.

You don’t need to manually trigger the report generation – it’s designed to work alongside your trading strategies, automatically collecting and organizing data. It uses a system to ensure each strategy and symbol combination has its own dedicated storage space, keeping everything nicely separated.  

There’s also a way to clear out the stored data if you want to start fresh or if you encounter issues. The initialization happens automatically when you start using the service, so you don't need to worry about setting anything up explicitly.

## Class BacktestLogicPublicService

BacktestLogicPublicService helps you run backtests more easily by handling the details of keeping track of things like the strategy name, exchange, and frame. It builds on top of another service to manage these details automatically.

You don't need to pass these details around explicitly when you’re calling functions like getting candle data or generating signals – the service takes care of it for you.

The `run` method is the main way to start a backtest, letting you specify the trading symbol and letting the service handle the rest of the setup and execution. It returns a stream of results, letting you process the backtest data as it becomes available.

## Class BacktestLogicPrivateService

This service handles the complex process of running backtests, particularly when dealing with asynchronous operations. It coordinates different components – like fetching timeframes, receiving signals, and retrieving historical data – to simulate trading. 

Think of it as an orchestrator; it doesn't do the trading itself, but manages all the moving parts. The process starts by getting the timeframes from a frame service, then it iterates through them, reacting to trading signals. When a signal tells the system to open a trade, it fetches the necessary historical data and runs the backtest logic.  It intelligently skips ahead in time until a signal closes the trade, and then provides the result. 

A key benefit is memory efficiency - it streams the results as they become available, rather than storing everything in memory at once.  You also have the ability to stop the backtest early if needed. The `run` method is the main entry point; you provide a symbol, and it generates a stream of backtest results.

## Class BacktestCommandService

This service acts as a central hub for initiating and managing backtesting operations within the system. It’s designed to be used by other parts of the application, making it easy to inject dependencies and keep things organized. 

Think of it as a go-to place to start a backtest, providing a clean interface for running simulations. It handles the underlying complexities of the backtesting process, like validating data and ensuring everything is set up correctly.

You can use it to kick off a backtest for a specific trading symbol, and you'll need to tell it which strategy, exchange, and frame to use. The service then takes care of running the simulation and providing you with the results. It’s a streamlined way to put your trading strategies to the test. 

It also has several helper services injected into it, such as validation and logging components, to make the backtesting process more reliable and transparent.

# backtest-kit interfaces

## Interface WalkerStopContract

This interface describes the information provided when a Walker is being stopped. Think of it as a notification that a particular trading strategy, running under a specific name, needs to be halted. The notification includes the trading symbol involved, the name of the strategy to stop, and the name of the Walker that's being interrupted. This is particularly useful when you have multiple strategies running concurrently on the same symbol and need to selectively stop one.

## Interface WalkerStatistics

The `WalkerStatistics` interface helps you understand the overall performance of your backtesting experiments. Think of it as a central place to collect and organize the results of multiple trading strategies. 

It bundles together the results from each strategy you're testing, making it easy to compare them side-by-side and draw conclusions about which ones are performing best. Specifically, it contains a list of `strategyResults`, each representing a single strategy's backtest outcome.

## Interface WalkerContract

The `WalkerContract` helps you keep track of how a comparison of trading strategies is progressing. It’s like a report card that’s updated as each strategy finishes its test. 

You'll find details about the specific strategy that just completed – its name, the exchange it was tested on, the symbol traded, and the statistics generated. The contract also tells you what's being optimized (the `metric`), and the current best result seen so far across all strategies being compared. 

Crucially, it provides context about the overall comparison: how many strategies have been tested, and how many more are left to go. Essentially, it provides a snapshot of the comparison’s status after each strategy concludes its run.

## Interface TickEvent

The `TickEvent` interface holds all the essential data about a trading event, bringing together information regardless of whether it's an idle state, a trade being opened, actively running, or being closed. Each event includes a timestamp indicating when it occurred. 

You’ll find details like the trading symbol, the signal ID that triggered the action, and the type of position taken, along with a note associated with the signal. For open positions, the `TickEvent` provides the opening price, take profit level, and stop-loss levels. While the trade is running, you can track progress towards the take profit and stop-loss using percentage indicators. Finally, when a trade closes, you're given the profit and loss percentage, the reason for closure, and the trade's duration.

## Interface ScheduleStatistics

This interface provides a snapshot of how your scheduled signals are performing. It gathers data about every scheduled event, whether it was successfully opened, cancelled, or remains scheduled.

You’ll find a complete list of events, including all details, in the `eventList` property. The `totalEvents` property simply gives you the overall count of all events processed. More specific counts are available for scheduled signals (`totalScheduled`), signals that were successfully opened (`totalOpened`), and signals that were cancelled (`totalCancelled`).

To understand efficiency, you can check the `cancellationRate` to see how often signals are being cancelled (a lower rate is desirable) and the `activationRate` to gauge how often scheduled signals are actually being activated (a higher rate is preferable). Finally, you can analyze the average waiting times for cancelled signals (`avgWaitTime`) and opened signals (`avgActivationTime`) to pinpoint potential bottlenecks or areas for optimization.

## Interface ScheduledEvent

This interface holds all the important details about events related to scheduled trades – whether they were planned, executed, or cancelled. It's designed to provide a consistent way to track and report on these events.

Each event will have a timestamp indicating when it occurred, and an action type specifying what happened (scheduled, opened, or cancelled). You’ll find the trading symbol, a unique signal ID, and the type of position taken.

The interface also includes notes associated with the signal, along with the market price at the time of the event, the planned entry price, take profit levels, and stop loss prices. If a trade was cancelled or opened, you'll also find the close timestamp and the duration of the trade.

## Interface ProgressWalkerContract

This interface describes the updates you receive while a background process, like evaluating strategies, is running within the backtest-kit framework. It gives you visibility into what's happening, allowing you to monitor the progress of the evaluation.

You’ll see information like the name of the process, the exchange and frame being used, and the trading symbol involved. Crucially, it tells you how many strategies are being assessed in total, how many have already been processed, and the overall percentage of completion. This allows for better user experience and potentially allows for interruption or monitoring of long-running tasks.

## Interface ProgressOptimizerContract

This interface describes the information provided during the execution of an optimizer, letting you monitor its progress. You'll receive events conforming to this structure as the optimizer works. Each event tells you the optimizer's name, the trading symbol it's working with, the total number of data sources it needs to analyze, and how many have been processed so far.  It also provides a percentage representing the overall completion, ranging from 0% to 100%. This allows you to build progress indicators or track the status of long-running optimization tasks.

## Interface ProgressBacktestContract

This interface helps you monitor how a backtest is progressing. It provides updates on the backtest's status, letting you see which exchange and strategy are being used, along with the trading symbol involved. You’ll receive information about the total number of historical data points the backtest will analyze and how many have already been processed. The interface also gives you a percentage representing the overall completion of the backtest, so you know how much longer it might take.

## Interface PerformanceStatistics

This interface holds all the performance data collected during a backtest. Think of it as a container for everything you need to evaluate how your trading strategy performed. 

It includes the name of the strategy being tested, a count of all the performance events that occurred, and the total time it took to run the performance calculations. 

The core of the data is stored in `metricStats`, which breaks down the statistics by different performance metrics. Finally, you're given access to the individual, raw performance events through the `events` property, allowing for detailed analysis.


## Interface PerformanceContract

The PerformanceContract helps you keep tabs on how your trading strategies are performing. It captures details about different operations, like how long they take to execute, allowing you to pinpoint areas for improvement. Each PerformanceContract entry includes a timestamp, the timestamp of the previous event (if there was one), and a type indicating what operation was measured. You'll also find information about the strategy and exchange involved, the trading symbol, and whether the metric comes from a backtest or live trading. This information helps you profile your system and identify bottlenecks to optimize its efficiency.

## Interface PartialStatistics

This data structure helps you keep track of how a trading strategy performs when it makes partial adjustments or takes profits/losses in stages. It gives you a breakdown of the events that happened during the backtest, allowing you to analyze the strategy’s behavior. You’ll find a list of all the individual profit and loss events recorded, along with the total count of all events, and separate counts for profitable and losing events. This allows for more detailed insights into strategy performance beyond just overall profit and loss.

## Interface PartialProfitContract

This interface describes what happens when a trading strategy hits a partial profit target, like 10%, 20%, or 30% profit. It's designed to help you understand how your strategy is performing and to track when partial take-profit orders are executed.

Each time a profit level is reached, an event is generated containing information like the trading pair's symbol, all the details about the signal that triggered it, the current price at the time, and the specific profit level achieved.

You'll also know whether the event occurred during a backtest (using historical data) or in a live trading environment.  Finally, there’s a timestamp recording exactly when that profit level was detected - whether that's the real-time moment in live trading or the candle time during backtesting.




The data includes the symbol, signal information (id, entry price, take profit, stop loss), the current price, the profit level reached, a flag indicating if it's from a backtest, and a timestamp.

## Interface PartialLossContract

This interface describes what happens when a trading strategy experiences a partial loss, like a stop-loss being triggered at a specific percentage. It's used to track how much a strategy has lost at various points, such as -10%, -20%, or -30% drawdown.

Each event includes the trading symbol, all the details about the original signal that triggered it, the current market price at the time of the loss, the specific loss level reached (e.g., 20 represents a -20% loss), whether the event happened during a backtest or live trading, and the timestamp of the event. 

These events are designed for services that generate reports and for allowing users to monitor their strategy's performance by setting up callbacks to be notified when these loss levels are hit. It’s important to remember that the 'level' property uses positive numbers to represent negative percentage losses.

## Interface PartialEvent

This interface helps you track and understand profit and loss milestones during a trading simulation or live trading. It gathers key details about each event, like when it happened (`timestamp`), whether it was a profit or a loss (`action`), and the trading pair involved (`symbol`). 

You'll also find information about which strategy generated the trade (`strategyName`), the signal that triggered it (`signalId`), and whether the trade is part of a backtest or live trading scenario (`backtest`). 

The `level` property provides the profit or loss level achieved (like 10%, 20%, etc.), and `currentPrice` tells you the market price at the time of the event. Essentially, it’s a standardized way to record the important data points related to profit and loss events.

## Interface MetricStats

This interface helps you understand the performance of a specific trading metric, like how long order fills take. It bundles together several key statistics about that metric, giving you a complete picture of its behavior. 

You'll find details like the total number of times a metric was recorded, how long each recording lasted, and important measures like the average, minimum, maximum, and standard deviation of those durations. Percentiles (like the 95th and 99th) are included to highlight potential outliers and delays. 

For metrics that involve timing between events, you'll also see wait time statistics, showing the distribution of those gaps. This provides a full set of data for analyzing and optimizing your trading system's performance.

## Interface MessageModel

This `MessageModel` helps structure the conversation history when working with LLMs, particularly within the Optimizer. Think of it as a simple container for each turn in a chat – whether it's instructions from the system, a question from the user, or a response from the LLM itself. Each `MessageModel` has a `role` property, which clarifies who sent the message (system, user, or assistant), and a `content` property that holds the actual text of the message. This structure ensures that prompts are built consistently and that the entire conversation context is properly maintained.

## Interface LiveStatistics

This interface, LiveStatistics, gives you a detailed snapshot of your trading performance while live. It collects a wide range of data points to help you understand how your strategies are doing.

You're provided with a complete list of trading events, including idle periods, openings, active trades, and closures. A total count of all events is also available.

Key metrics like the number of winning and losing trades, win rate, average PNL per trade, and cumulative PNL are all calculated and presented. To understand risk, you’re also given standard deviation (volatility) and the Sharpe Ratio, both annualized for easier comparison.  The Certainty Ratio, and expected yearly returns are also provided to further assess your strategy. All numeric values are carefully managed; if a calculation isn't possible due to unsafe data, the value will be null.

## Interface IWalkerStrategyResult

This interface represents the outcome of running a single trading strategy within the backtest comparison process. It holds key information about that strategy's performance. You'll see the strategy's name clearly identified, along with a detailed set of statistics summarizing its backtest results. A single metric value is included, which is used to compare strategies against each other. Finally, the `rank` property shows how well the strategy performed relative to the others – a lower rank number indicates a better performance.

## Interface IWalkerSchema

The `IWalkerSchema` helps you set up and manage A/B tests across different trading strategies within your backtesting environment. Think of it as a blueprint for comparing how well various strategies perform. 

Each schema defines a unique identifier for the test, a note for your own understanding, and specifies which exchange and timeframe should be used for all the strategies being compared. You’re also required to list the names of the strategies you want to test – these strategies need to be registered separately beforehand.

You can choose which performance metric to optimize, with a default of "sharpeRatio". Lastly, you have the option to add custom callbacks to monitor the testing process at different stages.

## Interface IWalkerResults

The `IWalkerResults` object holds all the information collected after a comparison of different trading strategies. It tells you which strategy walker ran the test, what symbol it was tested on, and which exchange and timeframe were used.

You’ll find details like the optimization metric used, the total number of strategies evaluated, and most importantly, the name of the top-performing strategy. The object also includes the best metric value achieved and a set of statistics specifically for that best strategy. Essentially, it's a complete report summarizing the results of your backtesting walk.

## Interface IWalkerCallbacks

This interface lets you hook into different stages of the backtest process, allowing you to monitor and react to what’s happening. 

You can use `onStrategyStart` to know when a particular strategy and symbol combination is about to be tested. 

`onStrategyComplete` is triggered when a strategy backtest finishes, providing you with statistics and a key metric. If a backtest encounters an error, `onStrategyError` will notify you, including details about the problem. Finally, `onComplete` is called once all the tests are done, giving you access to the overall results.

## Interface IStrategyTickResultScheduled

This interface represents a tick event in the backtest-kit framework, specifically when a trading strategy generates a scheduled signal and is waiting for the price to reach a certain level. Think of it as a notification that a trade is planned but hasn't yet been executed.

It contains details about the signal itself, including the strategy and exchange involved, the trading symbol (like BTCUSDT), the current price at the time the signal was created, and a unique identifier to help track the signal’s status.  Essentially, it’s a record of a planned trade waiting for the right market conditions. The `action` property confirms that the signal is currently scheduled.


## Interface IStrategyTickResultOpened

This interface represents the result you receive when a new trading signal is created within your backtesting strategy. It signifies that a signal has just been generated and is ready to be used. 

You'll see this result after your strategy's logic validates and saves a new signal. It provides key details like the newly created signal itself (including its unique ID), the name of the strategy that generated it, and the exchange and symbol associated with the trade. You also get the current price at the time the signal was opened, useful for analyzing performance.


## Interface IStrategyTickResultIdle

This interface describes what happens when your trading strategy is in an "idle" state – meaning it's not currently generating any trading signals. It provides key information about that moment, like the name of your strategy, the exchange being used, and the specific trading symbol (like BTCUSDT). You’ll also find the current price at the time the strategy was idle, which can be helpful for analysis. Essentially, it’s a record of when your strategy paused to consider its next move.

## Interface IStrategyTickResultClosed

This interface represents the result when a trading signal is closed, providing a comprehensive snapshot of the final outcome. It tells you precisely why the signal was closed - whether it was due to a time limit expiring, reaching a take-profit level, or triggering a stop-loss. You'll find key details like the closing price, the timestamp of the closure, and a detailed breakdown of the profit and loss, including any fees or slippage incurred. The interface also includes helpful labels for the strategy and exchange used, and the symbol being traded, which makes tracking and analyzing your trades much easier. Essentially, it’s a final report card for each closed signal, packed with all the information you need to understand its performance.

## Interface IStrategyTickResultCancelled

This interface describes what happens when a planned trading signal is cancelled – essentially, it didn't lead to a trade being opened. This might be because the signal never triggered, or because it was stopped before a position could be entered. 

It provides key information about the cancellation, including the signal that was cancelled, the final price when it was cancelled, the exact time of cancellation, and the names of the strategy, exchange, and the trading pair involved.  Think of it as a record of a signal that didn't quite work out as expected, allowing you to track and analyze why signals are being cancelled.


## Interface IStrategyTickResultActive

This interface represents a trading situation where a strategy is actively monitoring a signal, waiting for a specific event like hitting a take profit or stop loss, or a time limit expiring. It provides information about the current state of that active trade. 

You’ll see details like the name of the strategy, the exchange and symbol being traded, and the price used as a reference point (VWAP). Crucially, it tells you how far along the trade is towards its take profit and stop loss targets, expressed as percentages. This interface helps track the progress of a trade that's no longer just in the initial setup phase.


## Interface IStrategySchema

This defines the blueprint for a trading strategy within the backtest-kit framework. Think of it as a way to describe how your strategy generates trading signals.

Each strategy needs a unique name so the system can recognize it. You can add a note to explain your strategy for other developers.

The `interval` property controls how frequently your strategy can be evaluated, preventing it from overwhelming the system.

The core of the strategy is the `getSignal` function. This function analyzes data and decides whether to buy, sell, or hold. It can wait for a specific price to be reached or act immediately based on current prices.

You can also specify optional callbacks to react to events like when a position is opened or closed. 

Finally, you can assign a risk profile identifier to help manage risk associated with the strategy.

## Interface IStrategyResult

This interface, `IStrategyResult`, is designed to hold all the information about a single trading strategy run within the backtest kit. Think of it as a container for a single row in a comparison table of your strategies.

Each `IStrategyResult` includes the strategy’s name, so you know exactly which strategy the results belong to.  It also bundles together a full set of backtest statistics, giving you a comprehensive view of the strategy's performance. Finally, it stores the value of the metric you’re using to compare strategies – this is what helps you rank them. If the metric value is invalid for some reason, it will be marked as null.

## Interface IStrategyPnL

This interface describes the profit and loss (PnL) result for a trading strategy. It gives you the percentage gain or loss, showing how well your strategy performed. 

You’re also given the entry price (priceOpen) and exit price (priceClose) used in the calculation, but these prices have been adjusted to account for typical trading costs like fees (0.1%) and slippage (0.1%). This gives you a more realistic view of your strategy's profitability.

## Interface IStrategyCallbacks

This interface provides a way to respond to different events happening within your trading strategy. Think of them as notifications that your strategy can listen for and react to. 

You can define functions to be called whenever a new trading signal is opened, becomes active, goes idle, or is closed. There are also callbacks for scheduled signals, letting you know when a delayed entry is created or canceled. 

Furthermore, your strategy can receive notifications when a signal enters a partial profit or partial loss state, allowing you to adjust your actions accordingly. The `onTick` callback provides data from every price update, while `onWrite` is for persistence-related tests. These callbacks offer a flexible way to tailor your trading logic based on real-time and historical events.

## Interface IStrategy

The `IStrategy` interface outlines the fundamental methods any trading strategy built with backtest-kit must have.

The `tick` method is the heart of the strategy – it's called repeatedly with each incoming price update (tick) and handles essential tasks like generating signals (but not too frequently), and managing take profit and stop-loss conditions.

`getPendingSignal` lets you peek at the current signal the strategy is working with. This is useful for tracking things like remaining time or checking TP/SL levels, but is mostly used internally.

The `backtest` method offers a quick way to evaluate your strategy's performance against historical data; it rapidly simulates trades using provided candle data, monitoring VWAP and TP/SL.

Finally, `stop` provides a way to pause your strategy from creating new signals, allowing a clean exit while existing positions continue to run until they hit their target or expiration.

## Interface ISizingSchemaKelly

This interface defines a sizing strategy based on the Kelly Criterion, a method for determining optimal bet sizes. When implementing this strategy, you're essentially telling the backtest-kit how you want to size your trades. 

The `method` property is always set to "kelly-criterion" to identify this specific sizing approach.  The `kellyMultiplier` dictates how aggressively you’re using the Kelly Criterion – a smaller number like 0.25 means a more conservative approach (a quarter Kelly), while a larger number would be more aggressive.  The default value of 0.25 provides a starting point for reasonable bet sizing.

## Interface ISizingSchemaFixedPercentage

This schema defines a simple way to size your trades by always risking a fixed percentage of your capital. It's straightforward to implement – you just specify the `riskPercentage`, which is the percentage of your total capital you’re willing to lose on each individual trade. This value should be a number between 0 and 100, representing the risk you want to take with every trade. It’s a good starting point for beginners or for strategies that need predictable sizing.

## Interface ISizingSchemaBase

This interface, `ISizingSchemaBase`, provides a foundation for defining how much of your trading account should be used for each trade. Think of it as the blueprint for your sizing rules. 

It includes essential properties like `sizingName` to easily identify each sizing configuration, and a `note` field for adding developer comments. You can also set limits on position size using `maxPositionPercentage`, `maxPositionSize`, and `minPositionSize` to control risk.  Finally, you have the option to include `callbacks` for advanced control over the sizing process.

## Interface ISizingSchemaATR

This schema defines how your trades will size positions based on the Average True Range (ATR). It’s a way to adapt your position size to market volatility – when the market is moving more, you'll trade smaller amounts, and when it’s calmer, you can trade larger amounts. 

The `method` property is fixed to "atr-based", indicating that this schema uses ATR.  `riskPercentage` lets you specify what percentage of your capital you’re willing to risk on each trade, and `atrMultiplier` controls how far your stop-loss will be placed based on the ATR value – a higher multiplier means a wider stop. Essentially, this schema helps automate position sizing by dynamically adjusting to market volatility and limiting risk.

## Interface ISizingParamsKelly

This interface defines the settings you can use when determining how much to trade based on the Kelly Criterion. It's all about controlling how your trading strategy sizes its positions. 

The `logger` property lets you specify a logging service, which is helpful for tracking and debugging your strategy’s sizing decisions. This allows you to see how the Kelly Criterion calculations are influencing your trade sizes and helps identify any issues.

## Interface ISizingParamsFixedPercentage

This interface defines the parameters needed for setting up a trading strategy that uses a fixed percentage of your capital for each trade. It's designed to be used when initializing the sizing component of your backtesting setup. You'll provide a logger, which is used to record debugging information and help you understand what your strategy is doing. Think of the logger as a way to keep track of the strategy’s internal workings.

## Interface ISizingParamsATR

This interface defines the parameters you're likely to use when you want your trading strategy to size its trades based on the Average True Range (ATR). It's used when creating a `ClientSizing` object. 

You'll provide a `logger` here, which is useful for seeing what's happening behind the scenes—debugging your sizing logic is much easier when you can see those log messages. Think of it as a way to keep an eye on how your sizing calculations are working.

## Interface ISizingCallbacks

This interface helps you tap into the sizing process within the backtest-kit framework. Specifically, it provides a way to be notified after the system has determined how much of an asset to trade. You can use this notification, the `onCalculate` callback, to track the calculated size, verify that it makes sense given your trading strategy, or log the details for analysis. The callback receives the calculated quantity and parameters used for the calculation, giving you full visibility into what's happening.

## Interface ISizingCalculateParamsKelly

This interface defines the information needed to calculate trade sizing using the Kelly Criterion. It essentially tells the backtest kit how to determine the appropriate amount to trade based on your expected performance. 

You'll provide a `method` indicating that you want to use the Kelly Criterion. Then, you need to specify your expected `winRate`, which is the probability of a winning trade expressed as a number between 0 and 1. Finally, you also need the `winLossRatio`, representing your average profit compared to your average loss for each trade. These three pieces of information allow the system to calculate a safe and effective trade size.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the information needed to calculate trade sizes using a fixed percentage approach. When using this method, you're essentially committing to a specific percentage of your capital for each trade. 

The `method` property confirms you're using the "fixed-percentage" sizing technique. You’re also required to specify a `priceStopLoss`, which represents the price at which a stop-loss order will be triggered. This helps manage risk by automatically limiting potential losses.

## Interface ISizingCalculateParamsBase

This interface lays out the basic information needed for figuring out how much to trade. Every sizing calculation, whether it’s for initial positions or adding to existing ones, will use these parameters. You're going to need to know the trading pair, like "BTCUSDT", along with the current amount of money in your account and the price you're planning to buy or sell at. Think of it as the foundation for all sizing decisions.

## Interface ISizingCalculateParamsATR

This interface defines the information needed when calculating trade sizes based on the Average True Range (ATR). It requires you to specify that you’re using the "atr-based" sizing method, and it also needs the current ATR value itself as a number. Essentially, it's a straightforward way to tell the backtest kit how much to size your trades based on how volatile the market has been recently, as measured by the ATR.

## Interface ISizing

The `ISizing` interface is a core part of how backtest-kit determines how much of an asset your trading strategy will buy or sell. Think of it as the sizing engine—it takes information about your strategy's risk tolerance and market conditions and figures out the appropriate position size. 

The `calculate` property within this interface is the main method you'd interact with. It takes parameters that describe the situation—like your risk per trade and the current price—and returns a promise that resolves to the calculated position size. This method allows for flexible and customized sizing logic within your strategies.

## Interface ISignalRow

The `ISignalRow` interface represents a complete signal that's been processed and is ready for use within the backtest-kit. Think of it as the finalized version of a signal, containing all the necessary information for trading. 

Each signal gets a unique identifier, or `id`, to keep track of it throughout the backtesting process. You'll also find the entry price (`priceOpen`), the exchange being used (`exchangeName`), and the name of the trading strategy that generated it (`strategyName`). 

The `scheduledAt` property tells you when the signal was initially created, while `pendingAt` indicates when it became active.  The trading symbol, like "BTCUSDT", is stored in the `symbol` property. Finally, `_isScheduled` is an internal flag used by the system to mark signals that were originally scheduled.

## Interface ISignalDto

The `ISignalDto` represents a trading signal, essentially a set of instructions for a trade. When you request a signal, this is the data you’re likely to receive. 

Each signal includes a direction, whether it's a "long" (buy) or "short" (sell) position. There's also a `note` field for a brief explanation of why the signal was generated. You’ll find entry prices (`priceOpen`), and prices for managing the trade, including `priceTakeProfit` (where you’re aiming to sell for a profit) and `priceStopLoss` (a limit to prevent excessive losses). 

The framework can automatically assign an ID for the signal if you don’t provide one yourself. Finally, `minuteEstimatedTime` gives an idea of how long the signal is expected to remain active. The `priceTakeProfit` and `priceStopLoss` values need to align correctly with the trade direction – take profit should be above the entry for a long position, and below for a short one, with the stop loss reversed.

## Interface IScheduledSignalRow

The `IScheduledSignalRow` represents a signal that's designed to be executed when the price hits a specific level. Think of it as a signal that's patiently waiting for a particular price to be reached before it triggers a trade. 

It builds upon the standard `ISignalRow`, but adds the feature of delayed execution. 

The `priceOpen` property defines the price level that the signal will wait for. 

When the price matches `priceOpen`, the signal transforms into a regular pending signal, ready to be executed. 

Initially, the `pendingAt` field records the `scheduledAt` time, and it will then update to reflect the actual moment the price triggers the signal.

## Interface IRiskValidationPayload

This interface describes the information given to functions that check risk levels. It builds upon the `IRiskCheckArgs` interface by adding details about your portfolio's current state. 

You’ll find a `pendingSignal` property here, which represents the trading signal about to be executed. It also includes the number of positions you currently hold (`activePositionCount`) and a list of those active positions themselves (`activePositions`), providing a complete picture of your trading activity. This information helps risk validation functions assess the potential impact of a new trade.

## Interface IRiskValidationFn

This defines a special function that helps ensure your trading strategies are set up correctly and safely. Think of it as a safety check – it examines the risk parameters you're using (like how much you're risking per trade) and makes sure they meet certain rules. If those rules aren’t followed, the function will raise an error, stopping your backtest and alerting you to a potential problem before things go wrong. This helps prevent unrealistic or dangerous trading scenarios during testing.

## Interface IRiskValidation

This interface, `IRiskValidation`, helps you set up checks to make sure your trading strategies are behaving as expected. Think of it as a way to define rules your backtest must follow. 

You specify the actual validation logic using the `validate` property, which is a function that performs the check. The `note` property allows you to add a helpful description of what this validation is doing; this is really useful for explaining the rules of your backtest to others (or to yourself later!). It's all about ensuring your trading strategy’s risk parameters make sense.


## Interface IRiskSchema

This interface, `IRiskSchema`, helps you define and manage risk controls for your trading portfolio. Think of it as a blueprint for how you want to limit potential losses.

Each `IRiskSchema` has a unique `riskName` to identify it, and an optional `note` for developers to add clarifying details.

You can also specify optional `callbacks` for different stages of risk evaluation, allowing you to react to potential rejections or confirmations of trades.

The core of the schema lies in the `validations` array. This is where you list the custom checks you want to apply – they'll help you enforce your specific risk management rules.

## Interface IRiskParams

The `IRiskParams` interface defines the information needed when setting up a risk management system within backtest-kit. Think of it as a configuration object that tells the system how to handle risk-related operations.

It primarily focuses on providing a logger, which is essentially a tool for displaying messages and debugging information during backtesting. This logger helps you understand what's happening behind the scenes and identify any potential issues. 


## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, provides the information needed to assess whether a new trading signal should be allowed. Think of it as a gatekeeper that runs before a signal is generated. It bundles together essential data from the client strategy’s context, like the trading pair symbol, the details of the pending signal itself, the name of the strategy making the request, the exchange being used, the current price, and a timestamp. Essentially, it allows you to check if conditions are right before a trade is even considered.

## Interface IRiskCallbacks

The `IRiskCallbacks` interface lets you plug in your own functions to be notified about risk-related events during trading. Think of it as a way to get notified when a trading signal is blocked by risk limits, or conversely, when a signal is approved and can proceed.  You can define an `onRejected` function to handle situations where a signal fails a risk check – perhaps to log the event or take corrective action. Similarly, the `onAllowed` function is triggered when a signal successfully passes all risk checks, letting you know the trade is clear to execute. These callbacks provide a flexible way to monitor and react to risk assessments within your backtesting system.

## Interface IRiskActivePosition

This interface represents a single, active trading position that's being monitored for risk analysis across different strategies. Think of it as a snapshot of a trade that's currently open. 

Each position tracked has details like the signal that triggered it, the name of the strategy responsible for opening it, the exchange where the trade happened, and the exact time the position was started. This allows for a more complete picture of risk exposure, as you can see how positions from various strategies interact.


## Interface IRisk

The `IRisk` interface helps manage and control the risks associated with your trading strategies. It's designed to be used by the `ClientRisk` component to ensure trades don't exceed pre-defined risk limits. 

You'll use `checkSignal` to see if a potential trade is safe to execute, providing details about the trade for assessment. `addSignal` lets you inform the system when a new position is opened, tracking its impact on overall risk. Conversely, `removeSignal` is used to notify the system when a position is closed, updating the risk profile. These functions work together to provide a framework for responsible and controlled trading.

## Interface IPositionSizeKellyParams

This interface defines the settings you're providing when using the Kelly Criterion to determine how much of your capital to allocate to a trade.  It's all about calculating your position size.

You're essentially telling the system your expected win rate, expressed as a number between 0 and 1, and the average ratio of your wins to your losses. These two values are the heart of the Kelly Criterion calculation, helping you find a potentially optimal position size to manage risk and maximize returns.

## Interface IPositionSizeFixedPercentageParams

The `IPositionSizeFixedPercentageParams` interface holds the settings needed for a trading strategy that uses a fixed percentage of your capital for each trade.  It's designed to be straightforward, focusing solely on the parameters related to position sizing.  Specifically, you're required to provide a `priceStopLoss` value, which defines the price at which a stop-loss order will be triggered to protect your investment. This setting helps automate your risk management.

## Interface IPositionSizeATRParams

The `IPositionSizeATRParams` interface holds the information needed to calculate your position size based on the Average True Range (ATR).  It's a straightforward way to tell the backtest kit how much the ATR currently is.  You're essentially providing a single number – the `atr` – which the framework will use in its calculations to determine the appropriate size of your trades. This parameter helps in dynamically adjusting position sizes based on market volatility.

## Interface IPersistBase

This interface defines the basic functions needed to store and retrieve data persistently. Think of it as a foundation for managing how your trading strategies save and load information. 

It lets you initialize the storage area, ensuring everything is set up correctly. You can use it to check if a particular piece of data already exists, read existing data back from storage, and of course, save new data.  The writing process is designed to be safe, ensuring data isn't corrupted even if something goes wrong during the save.

## Interface IPartialData

This interface, `IPartialData`, is designed to help save and restore information about a trading signal. Think of it as a snapshot of key data points, specifically the profit and loss levels, that are needed to pick up where you left off. Because some data structures can't be directly saved, this interface transforms sets of levels into simple arrays so they can be easily stored and then rebuilt later. This allows the system to remember crucial progress even if it needs to be restarted. It's used internally to manage persistent data, allowing for a more robust and recoverable trading environment.

## Interface IPartial

The `IPartial` interface helps keep track of how your trades are performing, specifically focusing on profit and loss milestones. It’s used by the system to monitor trading signals and notify you when they hit certain levels of profit (like 10%, 20%, or 30%) or loss.

When a signal is generating profit, the `profit` method calculates the current state and triggers notifications for any new profit levels reached – avoiding repeated alerts for the same milestone. Similarly, the `loss` method handles loss scenarios and sends notifications for new loss levels.

Finally, the `clear` method is called when a trade is finished, cleaning up the system’s memory and saving any necessary changes related to that trade. It ensures the trading framework is tidy and ready for the next signal.

## Interface IOptimizerTemplate

This interface provides a way to create code snippets and messages used within the backtest-kit trading framework, especially when interacting with Large Language Models (LLMs). It allows you to generate the foundational pieces of your trading setup, like helper functions for debugging (jsonDump, text, json) and building up the core components.

You can use it to produce:

*   Initial setup code (topBanner) that sets up imports and basic configurations.
*   User and assistant messages tailored for conversations with LLMs.
*   Configurations for various trading elements, including Walkers, Exchanges, Frames (timeframes), and Strategies.
*   The launcher code that actually runs your trading setup and handles events. 

Essentially, this interface acts as a template engine to simplify building your backtesting environment and LLM integrations.

## Interface IOptimizerStrategy

This interface describes the data representing a trading strategy that has been created using a language model. It holds all the information needed to understand how the strategy was developed, including the specific trading pair it's designed for (the `symbol`). Each strategy has a unique `name` which makes it easy to identify in logs and when using callbacks.

The `messages` property stores the complete conversation history with the language model, showing exactly what was asked and how the model responded at each step. Finally, the `strategy` property contains the actual trading logic that was generated by the model – think of it as the instruction set for how to trade.

## Interface IOptimizerSourceFn

The `IOptimizerSourceFn` helps your backtest-kit framework get the data it needs to test and refine trading strategies. Think of it as a data pipeline – it’s a function that provides the training data for your optimizer. This function needs to be able to handle large datasets by fetching them in smaller chunks (pagination) and each piece of data should have a unique identifier to keep things organized. Essentially, it’s the way your optimizer gets fed information to learn from.

## Interface IOptimizerSource

This interface describes how your backtest data is provided to the optimization process. Think of it as a blueprint for how the system gets the information it needs to learn. 

You give it a unique name to easily identify the data source, and an optional description to explain what the data represents.

The most important part is the `fetch` function, which tells the system how to retrieve the data, including handling situations where you have a lot of data that needs to be retrieved in chunks.

You can also customize how the data is presented as messages for the LLM – defining separate functions, `user` and `assistant`, to format messages specifically for the user and assistant roles. If you don't provide these, the system uses default formatting.

## Interface IOptimizerSchema

This interface defines the blueprint for configuring how an optimizer works within the backtest-kit framework. Think of it as a set of instructions for creating and evaluating trading strategies.

It lets you specify a unique name to identify your optimizer. You can also break down your training process by defining multiple time ranges, each of which will produce a different version of your strategy for comparison. A separate testing time range is designated to validate the final strategy's performance.

The `source` property is key; it allows you to feed in different data sources that contribute to the strategy generation process.  A function, `getPrompt`, is responsible for crafting the prompt that will be used with a language model, incorporating the data from these sources and conversation history.

You have the flexibility to customize the generated code through optional template overrides.  Finally, you can include callbacks to monitor different stages of the optimization process.

## Interface IOptimizerRange

This interface, `IOptimizerRange`, helps you specify the time periods your trading strategy will be tested or optimized against. Think of it as defining the historical data window you want to use. It has three parts: a `note` which is a simple description to help you remember what this timeframe represents, a `startDate` marking the beginning date of the period, and an `endDate` marking the end date. These dates are inclusive, so data on those specific dates will be included in your analysis.

## Interface IOptimizerParams

This interface outlines the essential configuration needed when setting up a ClientOptimizer. Think of it as a blueprint for how the optimizer will operate. 

It requires a logger, which is used to track what’s happening during the optimization process and to provide helpful information for debugging. 

Crucially, it also needs a complete template – a collection of functions and methods that define how the backtesting and optimization will be carried out. This template combines your custom settings with default behaviors.

## Interface IOptimizerFilterArgs

This interface defines the information needed to fetch data for optimization. When retrieving historical data, you'll specify a trading symbol, like "BTCUSDT," along with a start and end date to define the time period you're interested in. Think of it as telling the system exactly which data it should pull for backtesting or optimization purposes.

## Interface IOptimizerFetchArgs

This interface defines the information needed when fetching data for optimization, especially when dealing with large datasets that need to be retrieved in smaller chunks. Think of it as a way to request data in pages. 

The `limit` property controls how many data points you want in each request – the default is 25, but you can change it. The `offset` property tells the system how many data points to skip before starting to fetch, allowing you to move through the dataset page by page. This helps manage memory and improve performance when working with lots of historical data.

## Interface IOptimizerData

This interface, `IOptimizerData`, acts as the foundation for how data is provided to your backtesting optimization process. Think of it as a standard format for the information your optimizer needs. Crucially, every piece of data you feed into the system *must* have a unique identifier, called `id`. This `id` helps avoid duplicates when you're dealing with large datasets and fetching data in chunks or pages. This ensures your optimization runs smoothly and accurately.

## Interface IOptimizerCallbacks

This interface lets you keep an eye on what's happening during the optimization process. It gives you functions to be notified at key moments, allowing you to track and verify different stages.

You'll receive a notification when data is fetched from your data sources, so you can log this information or double-check the data's integrity.

Another notification will let you know when code is generated for your strategies, giving you a chance to examine the generated code. 

You also get a signal when the strategy code has been saved to a file, allowing you to log that event or trigger other actions.

Finally, you'll be alerted once the initial data generation for your strategies is complete, offering another chance for logging or validation.

## Interface IOptimizer

This interface defines how you interact with the optimization process for generating trading strategies. It provides a way to retrieve data, create code, and save that code to a file.

You can use `getData` to pull information and build the foundation for your strategy, essentially setting up the initial data and context.  `getCode` then takes that information and produces the complete, runnable trading strategy code you’d use. Finally, `dump` lets you save the generated code directly to a file, organizing it for easy use and deployment. Think of it as a pipeline – data in, code out, and a convenient way to persist the final result.

## Interface IMethodContext

This interface, `IMethodContext`, acts like a little travel guide for your backtesting code. It holds the names of the key components – the exchange, the trading strategy, and the frame – that are being used in a particular operation. Think of it as a way to keep track of which parts of your system are working together.

The `exchangeName` tells your code which exchange schema it should interact with. Similarly, `strategyName` specifies the strategy being employed, and `frameName` identifies the frame being used (it's often empty when running in live trading mode). This context travels along with your code, ensuring that everything uses the correct components.

## Interface ILogger

The `ILogger` interface provides a standard way for different parts of the backtest-kit framework to record information. Think of it as a central place to keep track of what's happening within the system.

You can use it to log general events, detailed debugging information, informational updates, or even warnings about potential issues. This helps you understand the system’s behavior, find and fix problems, and monitor performance.

Specifically, the `log` method is for everyday events. `debug` is for very detailed information you might use when troubleshooting. `info` is for confirming successful operations, and `warn` flags anything that might need a closer look.

## Interface IHeatmapStatistics

This structure holds the overall statistics calculated for your portfolio's heatmap visualization. It provides a consolidated view of performance across all the assets you're tracking. 

You'll find an array of individual symbol statistics broken down by asset, along with key summary numbers like the total number of symbols in your portfolio, the total profit/loss generated, the Sharpe Ratio measuring risk-adjusted return, and the total number of trades executed. Essentially, it's a high-level snapshot of how your entire portfolio is performing, ready to be displayed in a visual heatmap.

## Interface IHeatmapRow

This interface represents a single row of data within a portfolio heatmap, providing a snapshot of performance for a specific trading symbol like BTCUSDT. It bundles together key metrics calculated across all strategies employed for that symbol, giving you a quick overview of its overall health.

You'll find information like total profit or loss percentage, a Sharpe Ratio to gauge risk-adjusted returns, and the maximum drawdown to understand potential downside risks.  It also includes a breakdown of trading activity, such as the total number of trades, win/loss counts, and win rate.

Detailed performance characteristics are also provided, including average profit per trade, standard deviation of profit, and insights into winning and losing trade sizes. Finally, you can analyze streaks and expectancy to better understand the long-term viability of trading this symbol.

## Interface IFrameSchema

The `IFrameSchema` is how you tell backtest-kit about a specific time period and frequency you want to analyze. Think of it as defining a "window" into your historical data. Each schema has a unique name so the system knows which window it's working with. You can add a note to help remember what that particular window represents.

The `interval` property tells the system how often data points should be generated—daily, hourly, or something else. You’ll specify the `startDate` and `endDate` to define the beginning and end of the backtesting period.  Finally, you can add optional callback functions that get executed at key points in the frame’s lifecycle if you need to customize how it behaves.

## Interface IFrameParams

The `IFrameParams` interface defines the information needed when setting up a ClientFrame, which is a core part of the backtest-kit framework. It’s like a set of instructions that tells the framework how to create and configure a frame for your backtesting environment. 

Think of it as a container holding configuration details, and critically, it includes a `logger`. This logger is your friend for debugging; it lets you see what’s going on inside the frame as your backtest runs, helping you track down any unexpected behavior. It’s all about giving you visibility into the inner workings of your trading strategy’s execution.

## Interface IFrameCallbacks

The `IFrameCallbacks` interface lets you hook into key moments in how backtest-kit generates the time periods your trading strategies will be evaluated against. 

Specifically, the `onTimeframe` callback gets triggered right after the timeframe array is created. This is a handy place to check if the generated timeframes look correct, maybe to log them for inspection or ensure they align with your expectations. You'll receive the array of dates, the start and end dates of the period, and the time interval used to create them.

## Interface IFrame

The `IFrames` interface is a core piece of the backtest-kit, handling the creation of timeframes for your trading simulations. Think of it as the engine that sets up the regular intervals – like daily, hourly, or minute-by-minute – during which your trading strategy will be tested. Its main function, `getTimeframe`, is responsible for producing an array of dates, essentially giving you the exact timestamps needed to run your backtest step-by-step. You provide the trading symbol and the name of the timeframe you want (like "daily" or "hourly"), and it returns a list of dates to guide the backtest process.

## Interface IExecutionContext

The `IExecutionContext` interface holds important information about the current state of your trading operations. Think of it as a little package of details that's passed around to provide context for actions like fetching historical data, handling incoming ticks, and running backtests.  It tells your strategy *what* symbol is being traded, *when* the current event is happening (the timestamp), and crucially, whether it's a backtest or a live trading scenario. This context allows your strategies to behave correctly and adapt to different environments.

## Interface IExchangeSchema

This interface describes how backtest-kit interacts with different trading platforms. Think of it as a blueprint for connecting to an exchange, whether it's a real one or a simulated environment. It defines how the framework retrieves historical price data (candles), calculates the correct quantity of assets to trade, and formats prices according to each exchange's specific rules. 

You're essentially defining the connection details: how to get the candles you need, how to make sure you're using the correct number of decimal places for trades, and optionally, what actions to take when new candle data arrives. The `exchangeName` gives each connection a unique identifier, and the `note` allows you to add helpful documentation for yourself or others.

## Interface IExchangeParams

The `IExchangeParams` interface defines the information needed when setting up an exchange within the backtest-kit framework. Think of it as a configuration object you pass to create an exchange instance. 

It requires a `logger` to help with debugging and understanding what's happening during your backtesting process.  You'll also need to provide an `execution` object, which contains details about the environment of the backtest, such as the trading symbol and the timeframe being used. This context ensures the exchange operates correctly within the intended backtesting scenario.

## Interface IExchangeCallbacks

The `IExchangeCallbacks` interface lets you hook into events happening when your backtest kit connects to an exchange. You can provide functions to be notified when candle data becomes available. The `onCandleData` callback, for example, will be triggered whenever the system retrieves candlestick data; it provides the symbol, interval, start date, number of candles requested, and the actual candle data received. This is useful for custom data handling or real-time monitoring during a backtest.

## Interface IExchange

The `IExchange` interface is designed to give backtest-kit users a way to interact with simulated exchange data. It provides methods for retrieving historical and future candle data, essential for simulating trading scenarios. 

You can use `getCandles` to get historical price data for a specific trading pair and time interval, and `getNextCandles` to look ahead and fetch data for the future (specifically helpful during backtesting). 

The `formatQuantity` and `formatPrice` methods help ensure that trade orders conform to the exchange's specific rules by appropriately formatting the quantity and price.

Finally, `getAveragePrice` calculates the Volume Weighted Average Price (VWAP) based on recent trading activity, using the typical price (average of high, low, and close) and volume of the last five 1-minute candles.

## Interface IEntity

This interface, `IEntity`, serves as the foundation for any data that your backtesting system stores persistently. Think of it as a common blueprint – every object you want to save and load later will likely implement this interface. It ensures a consistent structure across your data, making it easier to manage and work with different types of saved information within your trading framework.

## Interface ICandleData

This interface represents a single candlestick, a common way to visualize price action over time. Each candlestick holds information about the opening price, the highest price reached, the lowest price reached, the closing price, and the volume of trades that occurred during that timeframe. The `timestamp` tells you exactly when that period began, measured as milliseconds since a specific point in time. This data is fundamental for analyzing price trends and building trading strategies within the backtest-kit framework.

## Interface DoneContract

This interface, `DoneContract`, is how backtest-kit signals that a background task, either a backtest or a live trade execution, has finished. It provides essential details about what just completed. 

You'll receive an instance of `DoneContract` when a background process concludes. It tells you which exchange was used, the name of the strategy that ran, whether it was a backtest or a live execution, and the trading symbol involved. Think of it as a notification package summarizing the just-finished operation.

## Interface BacktestStatistics

This interface holds a collection of statistics generated from a backtesting run, providing a detailed picture of your trading strategy's performance. It includes a list of every closed trade, along with key metrics like the total number of trades, the number of winning and losing trades, and the win rate.

You’ll find information about the average Profit and Loss (PNL) per trade, the overall cumulative PNL, and measures of risk such as standard deviation and the Sharpe Ratio.  The Sharpe Ratio, and its annualized version, help you understand how much return you’re getting for the amount of risk you’re taking.  The Certainty Ratio indicates the relationship between average winning and losing trade sizes, and the expected yearly returns give you an idea of potential annualized gains. If a value is null, it means the calculation wasn’t reliable due to potential issues like infinite or undefined results.
