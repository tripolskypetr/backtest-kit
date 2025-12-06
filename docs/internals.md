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

This function lets you plug in your own logging system for backtest-kit. It allows you to control where and how backtest-kit's internal messages are displayed. When you provide a custom logger, the framework will automatically add helpful context to each log entry, like the strategy name, exchange, and trading symbol, making it easier to understand what's happening during your backtests. You simply need to create a logger object that follows the `ILogger` interface and pass it to this function.

## Function setConfig

This function lets you adjust how backtest-kit operates by modifying its global settings. Think of it as tweaking the overall behavior of the framework. You can change various parameters to tailor the backtest environment to your specific needs. It accepts a configuration object, allowing you to selectively override the default settings – you only need to specify the values you want to change, not the entire configuration. The function completes with a Promise, signaling when the settings have been applied.

## Function listWalkers

This function gives you a look under the hood, revealing all the different "walkers" that are currently set up within the backtest-kit framework. Think of walkers as specialized components that analyze and process your trading data. It returns a list describing each one, allowing you to see what's happening and potentially build tools to visualize or manage them. Essentially, it's a peek at the internal structure of your backtesting environment.

## Function listStrategies

This function lets you see all the trading strategies currently set up within the backtest-kit framework. It essentially provides a complete inventory of the strategies you're working with. Think of it as a way to check what’s available for backtesting or to programmatically build interfaces that display these strategies. The result is a list where each item describes a strategy’s configuration and details.

## Function listSizings

This function gives you a look at all the sizing configurations currently in use. It’s like getting a complete inventory of how your backtest-kit is handling position sizing. Think of it as a way to check what rules are being applied to determine trade sizes, which can be really helpful when you’re troubleshooting or building tools to visualize your strategy. The function returns a list of these sizing configurations, allowing you to examine them programmatically.

## Function listRisks

This function helps you see all the risk configurations your backtest setup uses. It returns a list of risk schemas that have been previously registered. Think of it as a way to inspect what risks your trading strategy is considering. You can use this to check your setup, generate documentation, or build interfaces that react to the different risks involved.

## Function listOptimizers

This function helps you discover all the different optimization strategies available within the backtest-kit framework. Think of it as a way to see what options are set up to fine-tune your trading simulations. It gives you a list of descriptions, or schemas, for each optimizer, allowing you to understand what they do and how they might be used. You can use this information to build tools that automatically explore different optimization approaches or simply to get a clear overview of your setup.

## Function listFrames

This function helps you discover all the different data frames your backtest kit is using. Think of it as a way to see a catalog of all the "views" into your historical data that you’re working with. It returns a list describing each frame, allowing you to understand what data is available and how it's structured. This is really handy if you're trying to understand your setup, build tools that interact with your frames, or create documentation.

## Function listExchanges

This function helps you discover all the exchanges your backtest-kit setup knows about. It essentially gives you a list of all the different trading venues that have been added to the system. You can use this to check what exchanges are configured, build tools that adapt to different exchanges, or simply to get a quick overview of your trading environment. The function returns a promise that resolves to an array, where each item in the array describes a registered exchange.

## Function listenWalkerProgress

This function lets you keep track of how a backtest is progressing. It's like getting updates after each strategy finishes running within the backtest. You provide a function that will be called with information about the progress, and this function will return another function to unsubscribe from those updates. Importantly, the updates are handled one at a time, even if your callback function takes some time to process, ensuring things don’t get messy with concurrent operations.

## Function listenWalkerOnce

This function lets you temporarily listen for changes happening within a trading simulation, but only once a specific condition is met. You provide a filter that defines what kind of change you're interested in, and a function to execute when that change occurs. Once the filter matches an event and your function runs, the listener automatically stops, so you don't have to worry about managing subscriptions. It's a convenient way to react to a particular event and then move on.

The `filterFn` determines which events you want to see – it’s a function that checks each event to see if it matches your criteria. The `fn` is the action you want to take when a matching event is found; it's only executed once.

## Function listenWalkerComplete

This function lets you get notified when the backtest kit finishes running all your strategies. Think of it as a signal that the entire testing process is done. When it fires, it gives you a result object containing information about all the strategies that were tested.  The important thing is that the notification happens in a controlled way - even if your callback function does some asynchronous work, it won't interfere with other processes, ensuring things run smoothly and in the intended order. You provide a function that will be called when the testing is complete, and this function returns another function that you can use to unsubscribe from the completion events.

## Function listenWalker

This function lets you keep an eye on how a backtest is progressing. It's like setting up a notification system that tells you when each trading strategy finishes running within the backtest. The information you receive is delivered in the order it happens, and even if your notification code takes some time to process, it won't interfere with the backtest itself – everything is handled carefully to keep things running smoothly. To use it, you provide a function that will be called for each completed strategy, and this function returns another function that you can use to unsubscribe from the notifications when you no longer need them.

## Function listenValidation

This function lets you keep an eye on potential problems during your trading strategy's risk validation checks. It essentially sets up a listener that will notify you whenever a validation process throws an error. 

Think of it as an error reporting system specifically for when your strategy is being checked for risks. The errors you receive are delivered in the order they happen, and the system ensures they’re handled one at a time, even if your error handling code takes some time to run. You provide a function that gets called with the error details whenever a validation error occurs.

## Function listenSignalOnce

This function lets you subscribe to signals from your trading strategy but with a twist – it only listens once. You provide a filter to specify which signals you're interested in, and then a function that will be executed exactly one time when a matching signal arrives. After that single execution, the subscription automatically stops. It’s really handy when you need to react to a specific trading signal just once and then move on.

The function takes two arguments: a filter function and a callback function. The filter function determines which signals trigger the callback. The callback function then handles the single event that meets your criteria.


## Function listenSignalLiveOnce

This function lets you temporarily listen for specific trading signals coming from a live backtest run. Think of it as setting up a short-term alert.

You provide a filter – a rule that determines which signals you’re interested in – and a callback function that gets executed *only once* when a signal matches your filter.

After that single execution, the function automatically stops listening, so you don’t need to manually unsubscribe. It's perfect for quickly reacting to a particular event in a live test without cluttering up your code with ongoing subscriptions. The events it receives come directly from a Live.run() execution.


## Function listenSignalLive

This function lets you hook into the live trading signals generated by your backtest kit strategy. It's a way to get updates as your strategy is actively running and making decisions. Think of it as setting up a listener that gets notified whenever a signal is produced.

The signals are delivered one at a time, ensuring they're processed in the order they're generated. This function is specifically designed for use with `Live.run()` – you won’t get signals from other parts of the backtest kit. 

You provide a function (`fn`) that will be called with each signal, allowing you to react to those events in real-time. The function you provide returns another function that can be called to unsubscribe from these live signal updates.

## Function listenSignalBacktestOnce

This function lets you temporarily listen for specific signals generated during a backtest run. Think of it as setting up a short-lived observer that only cares about signals that meet a certain condition. You provide a filter – a rule to decide which signals you want to see – and a function that will be executed exactly once when a matching signal arrives. After that single execution, the listener automatically stops listening, keeping your code clean and avoiding unnecessary processing. This is useful for quickly extracting specific data points or performing actions based on isolated events during backtesting.


## Function listenSignalBacktest

This function lets you tap into the flow of a backtest and receive updates as they happen. Think of it as setting up a listener that gets notified whenever a signal is generated during a backtest run. It’s particularly useful if you need to react to these signals in real-time, perhaps to log them or perform calculations based on them.  The signals are delivered one at a time, ensuring they're processed in the order they were created during the backtest. You're only receiving events specifically from a `Backtest.run()` execution. The function returns a way to unsubscribe from these updates when you're finished.

## Function listenSignal

This function lets you hook into the trading signals generated by your backtest. Whenever your strategy produces a signal – whether it’s deciding to buy, sell, or do nothing – this function will call your provided callback function.

Think of it as setting up a listener that gets notified every time something important happens with your trading strategy.

Importantly, the signals are processed one after another, even if your callback function takes some time to complete. This ensures things happen in the right order and avoids unexpected behavior. You provide a function that will be executed each time a signal is available.


## Function listenPerformance

This function lets you monitor how your trading strategies are performing in terms of speed and efficiency. It’s like setting up a listener that gets notified whenever a performance metric changes during your strategy's execution. You provide a function that will be called with these performance updates, and this allows you to pinpoint slow areas or bottlenecks in your code. The system ensures that these updates are processed one at a time, even if your callback function itself takes some time to complete, guaranteeing a consistent order of events. Essentially, it’s a way to keep an eye on your strategy's timing and help you optimize its performance.

## Function listenPartialProfitOnce

This function lets you set up a temporary listener for partial profit events. Think of it as a "wait for this specific condition and then do something" kind of setup. 

You provide a filter – a way to identify the exact profit levels you're interested in – and a function to run when that specific event occurs. Once the event happens and your function executes, the listener automatically turns itself off. It’s really handy if you only need to react to a particular profit condition once and then don’t need to keep listening.

The first argument, `filterFn`, defines what events should trigger your action. The second argument, `fn`, is the action itself that gets performed when the filter matches.

## Function listenPartialProfit

This function lets you keep track of your trading progress by getting notified when your profits reach certain milestones, like 10%, 20%, or 30% gains. It's designed to handle these notifications in a reliable way, even if the processing of each notification takes some time. The notifications happen in the order they’re received, ensuring everything is handled sequentially. To use it, you simply provide a function that will be called whenever a profit milestone is reached, and this function receives information about the event. The function returns a cleanup function that you can use to unsubscribe from the events when you no longer need them.

## Function listenPartialLossOnce

This function lets you react to specific partial loss events just once, then automatically stop listening. Think of it as setting up a temporary alert – you specify a condition (like a certain loss level being reached) and a function to run when that condition is met. After the function runs once, the listener quietly stops, preventing it from triggering again. It’s handy when you need to react to a particular situation briefly without ongoing monitoring.

You provide a filter function that defines which events you're interested in, and then a callback function that will be executed only once when a matching event occurs.


## Function listenPartialLoss

This function lets you be notified whenever your trading strategy experiences a certain level of loss, like 10%, 20%, or 30% of its capital. It’s designed to handle these notifications in a controlled way, ensuring that your code doesn't run into unexpected issues by processing them one at a time, even if your handling logic takes some time. You provide a function that will be called with information about the partial loss event whenever it occurs. This helps you monitor your strategy's performance and potentially react to significant drawdowns.

## Function listenOptimizerProgress

This function lets you keep an eye on how your optimizer is doing as it runs. It sends updates about the progress, especially when dealing with data sources. These updates are delivered one at a time, even if the code you provide to handle them takes some time to complete. This ensures a smooth and predictable flow of information during the optimization process. You provide a function that gets called whenever there's an update, and this function will be executed in a controlled, sequential manner.

## Function listenExit

This function lets you be notified when something goes seriously wrong and stops the backtest-kit processes like background tasks. It's designed for errors that can't be recovered from, unlike the `listenError` function which handles more minor issues. When an unrecoverable error occurs, this function will call the callback you provide, ensuring the error information is passed along. Importantly, the callback runs sequentially, even if it’s an asynchronous function, so you won't have multiple errors happening at once. This helps keep things orderly when dealing with critical failures. You provide a function as input, and the function returns another function which you can use to unsubscribe from these exit notifications later.

## Function listenError

This function lets you set up a listener that gets notified whenever your trading strategy encounters a recoverable error – think of it as a safety net for potential hiccups during execution, like a failed API request. Instead of abruptly stopping, your strategy keeps going, and this listener gives you a chance to handle the problem gracefully.

The listener works by processing these errors one at a time, in the order they happen, even if the handling process involves asynchronous operations. This ensures that errors are dealt with systematically and prevents unexpected issues caused by multiple callbacks running at once.

You provide a callback function that will be executed whenever an error occurs. This function receives the error object as an argument, giving you the information you need to respond appropriately. The function you provide will return an unsubscribe function which can be used to stop listening to errors.

## Function listenDoneWalkerOnce

This function lets you react to when a background task within your trading strategy finishes, but only once. You provide a filter to specify which finishing tasks you’re interested in, and a function to run when a matching task completes.  Once that callback has executed once, the subscription is automatically removed, so you won't be notified again. This is useful for actions that should only happen once after a background process completes. 

It takes two parts: a filter that checks if the finishing event is what you're looking for, and then the function you want to run *once* when a matching event occurs. The function returns a cleanup function that you can call to manually unsubscribe if you need to.

## Function listenDoneWalker

This function lets you be notified when a background task within the backtest-kit framework finishes running. It's designed for situations where you need to react to the completion of these tasks, ensuring your code doesn't try to do things out of order.

Essentially, you provide a function (`fn`) that will be called whenever a background task is done. The function will receive an event containing information about the completed task.

A key feature is that it queues the execution of your callback function, so even if your callback is asynchronous, it will run one step at a time, maintaining a reliable sequence of events. This helps prevent unexpected behavior caused by simultaneous operations. You get back a function that you can call to unsubscribe from these notifications.

## Function listenDoneLiveOnce

This function lets you react to when a background task finishes running, but only once and then it stops listening. You provide a filter to specify which completed tasks you’re interested in, and a function to execute when a matching task finishes. Think of it as setting up a temporary listener that automatically cleans itself up after it’s triggered a single time. It’s handy for things like confirming an action happened or updating a UI element once a background process is complete.


## Function listenDoneLive

This function lets you track when background tasks run by the Live system are finished. Think of it as setting up an alert that triggers when a background process is done. 

It provides a way to receive notifications about the completion of these tasks, ensuring that any actions you take based on these completions happen in the order they're received. 

To use it, you provide a function (the `fn` parameter) that will be called when a background task finishes. This function will receive information about the completed task as a `DoneContract` object. Importantly, even if your callback function involves asynchronous operations, the events will still be handled one at a time, preventing any unexpected conflicts. 

The function returns another function that you can call to unsubscribe from these completion events whenever you need to stop receiving them.

## Function listenDoneBacktestOnce

This function lets you react to when a background backtest finishes, but in a special way: you only get notified once. You provide a filter – essentially, a rule – to determine which completed backtests you're interested in. Once a backtest completes and matches your filter, a function you provide will be executed. After that single execution, the notification is automatically turned off, so you don't get bothered by future completions. It's perfect for actions you only need to perform once after a specific backtest is done.

It takes two parts: first, a test to see if the backtest meets your requirements, then the action you want to take when it does. 


## Function listenDoneBacktest

This function lets you be notified when a background backtest finishes running. It's like setting up a listener that gets triggered once the backtest is complete. The function you provide will be called with details about the finished backtest. Importantly, even if your notification code takes some time to execute (like making an asynchronous request), the notifications will be handled one at a time, in the order they arrive, to keep things organized. You're essentially subscribing to a notification about when the backtest is done, and the system will manage the execution order of your response.


## Function listenBacktestProgress

This function lets you keep an eye on how your backtest is running. It’s like setting up a listener that gets notified as the backtest progresses, especially useful when you're running things in the background. The listener will receive updates sequentially, and even if your callback function takes some time to process (like making an asynchronous call), the updates are handled one at a time to avoid any issues. You provide a function that will be called with progress information, and this function returns another function that you can use to unsubscribe from the progress updates when you're done.

## Function getMode

This function tells you whether the trading framework is running in backtest or live mode. It’s a simple way to check if you’re simulating trades with historical data or executing real-time transactions. The function returns a promise that resolves to either "backtest" or "live", providing a clear indication of the current operational context. It helps ensure your code behaves appropriately depending on the environment it's running in.

## Function getDate

This function, `getDate`, gives you the current date within your trading simulation or live trading environment. Think of it as a way to know what date your calculations and decisions are based on. When you're backtesting, it provides the date associated with the specific historical timeframe you're analyzing. If you're running live, it gives you the actual, current date. It's a simple way to keep track of the temporal context of your trading logic.

## Function getCandles

This function lets you retrieve historical price data, like open, high, low, and close prices, for a specific trading pair. Think of it as pulling up a chart of past prices. You tell it which trading pair you're interested in (like BTCUSDT), how frequent the data should be (every minute, every hour, etc.), and how many data points you need. The function then reaches out to the exchange you're connected to and gets the data. The data is returned as an array of candle objects, each representing a time period.

## Function getAveragePrice

This function helps you figure out the average price of a trading pair like BTCUSDT. It does this by looking at the last five minutes of trading data and calculating a Volume Weighted Average Price, which considers both price and volume. Essentially, it gives you a sense of what the "typical" price has been recently, taking into account how much trading has occurred at each price level. If there's no trading volume, it falls back to a simple average of the closing prices instead. To use it, you just need to provide the trading pair's symbol.

## Function formatQuantity

This function helps you ensure that the quantity you're using for trades is formatted correctly according to the specific exchange you're working with. It takes a trading symbol, like "BTCUSDT", and the raw quantity value as input. The function then automatically applies the exchange's rules for decimal places, so you don't have to worry about getting that part right yourself. This ensures your order submissions are compliant and avoids potential rejections. Essentially, it cleans up your quantity input to match the exchange's expectations.

## Function formatPrice

This function helps you display prices correctly for different trading pairs. It takes a symbol like "BTCUSDT" and a raw price value, and then formats the price to match the specific rules of the exchange you're using. This ensures the displayed price has the right number of decimal places, making it look professional and accurate for your users. You just give it the trading pair and the price, and it handles the formatting details for you.

## Function dumpSignal

This function helps you save detailed records of your AI trading strategy's decisions. It's designed for strategies that use LLMs to generate trading signals, allowing you to review exactly what happened during a trade.

It takes the signal ID, the conversation history between your system and the LLM, and the final trading signal as input. The function then organizes this information into a well-structured set of markdown files. You'll find a file summarizing the system prompt, individual files for each user message sent to the LLM, and a final file containing the LLM’s output and the resulting trading signal.

To avoid accidentally losing past data, the function checks if the output directory already exists and skips writing if it does. You can specify where to save these files, or it will default to a "dump/strategy" directory. This feature allows you to easily debug and analyze your strategy’s performance.


## Function addWalker

This function lets you register a "walker" which is essentially a tool for comparing how different trading strategies perform against each other. Think of it as setting up a standardized testing environment where you can run several strategies on the same historical data and see which one does best based on a defined performance measure. You provide a configuration object, the `walkerSchema`, to tell the system how to run and evaluate these strategy comparisons. This allows for a more structured and insightful way to assess your strategies.

## Function addStrategy

This function lets you tell backtest-kit about a new trading strategy you've built. Think of it as registering your strategy so the framework knows how to use it. When you register a strategy, it’s automatically checked to make sure the signals it generates are valid and consistent. The framework also helps prevent a flood of signals and ensures your strategy's data can be safely saved even if there are unexpected interruptions. You provide a configuration object that describes your strategy, and the framework takes care of the rest.

## Function addSizing

This function lets you tell backtest-kit how to determine the size of your trades. Think of it as defining your risk management strategy. You provide a configuration object that specifies things like whether you want to use a fixed percentage of your capital, a Kelly Criterion approach, or something based on Average True Range (ATR). 

The configuration also lets you set limits, like minimum and maximum position sizes, and control the maximum percentage of your capital that can be used for any single trade. It's how you integrate your specific sizing logic into the backtesting process. 


## Function addRisk

This function lets you set up how your trading framework manages risk. Think of it as defining the guardrails for your trading strategies. You provide a configuration that specifies things like the maximum number of simultaneous trades allowed across all your strategies. 

You can also include more complex rules, like checking portfolio metrics or correlations between different assets. The framework then uses these rules to decide whether a trade signal should be allowed or rejected. 

Importantly, this risk management applies to all your trading strategies, which helps ensure a consistent and safe approach to trading. It’s a central piece of controlling risk across your entire system.

## Function addOptimizer

This function lets you register a custom optimizer within the backtest-kit framework. Think of an optimizer as a way to automatically generate trading strategies based on your data and instructions. It pulls information from various sources, uses Large Language Models to craft prompts, and then builds complete, runnable backtest code. You provide a configuration object that defines how your optimizer works, and the framework takes care of the rest, creating a fully functional .mjs file ready for testing. It essentially automates the process of creating and configuring trading strategies.

## Function addFrame

This function lets you tell backtest-kit about a new timeframe you want to use in your backtesting. Think of it as defining a "schedule" for how data will be fetched and processed. You provide a schema that specifies the starting and ending dates for your backtest, the interval (like daily, hourly, or minute data), and a way to handle any events related to generating that timeframe. Essentially, it's how you connect backtest-kit to your data sources and tell it *when* and *how* to get that data.

## Function addExchange

This function lets you tell backtest-kit about a new data source for trading, essentially connecting it to where your historical price data comes from. You provide a configuration object that describes how to fetch historical price information, how prices and quantities should be formatted, and how to calculate things like VWAP. Think of it as teaching the framework where to find the market data it needs to run your trading strategies. Adding an exchange is a crucial first step in setting up a backtest.

# backtest-kit classes

## Class WalkerValidationService

The WalkerValidationService helps ensure your trading strategies, or "walkers," are properly defined and set up. Think of it as a quality control system for your strategies. 

You can add walker schemas to the service, essentially registering the blueprint for each strategy. 

The service provides a way to validate that a specific walker exists, confirming it's ready to be used. It also allows you to list all the registered walker schemas, giving you a clear overview of the strategies you’ve defined. The `loggerService` property allows to log errors and warnings.

## Class WalkerUtils

WalkerUtils provides helpful tools for running and analyzing trading walker comparisons. Think of it as a convenient wrapper around the more complex walker execution process.

It simplifies running walkers by automatically handling details like the exchange and frame names. You can use it to execute comparisons and get the results, or run them in the background for tasks like logging without needing to see the progress updates directly.

Need to see the combined results of all the strategy comparisons? `getData` provides that information.  Want a nicely formatted report in markdown? Use `getReport`.  And if you need to save that report to a file, `dump` makes it easy. This class is designed to be used everywhere, as it’s a single, readily available instance.

## Class WalkerSchemaService

The WalkerSchemaService helps you keep track of your trading strategies’ configurations in a safe and organized way. Think of it as a central place to store and manage the blueprints for your trading walkers.

It uses a special system to ensure the information you store is always in the expected format, preventing errors down the line. You can add new strategy blueprints using `addWalker()` and retrieve them later by name using `get()`. 

If you need to update a blueprint, the `override()` function allows you to change just specific parts of it. Before adding a new blueprint, `validateShallow()` checks to make sure it has all the necessary components. The service keeps a record of all your walker schemas, making it easy to manage and reuse them.

## Class WalkerMarkdownService

The WalkerMarkdownService helps you automatically generate and save reports about your trading strategies. It listens for updates from your trading simulations, keeping track of how each strategy performs. 

It organizes results for each simulation ("walker") separately, so you can easily compare them. The service then builds nicely formatted markdown tables that show the detailed results of each strategy. These reports are saved as `.md` files in a dedicated directory, making it easy to review and share your findings. 

You can clear the accumulated data to start fresh or focus on a specific simulation by name. It also handles initializing itself automatically when you first start using it, so you don’t have to worry about setup.

## Class WalkerLogicPublicService

The WalkerLogicPublicService acts as a helpful manager for coordinating and running your trading walkers. It builds upon the WalkerLogicPrivateService and MethodContextService to automatically handle important details like the strategy name, exchange, frame, and walker name, so you don't have to pass them around manually.

Essentially, it simplifies the process of running your backtests.

The `run` method is the main way to use this service. You give it a trading symbol and a context object, and it will execute your backtests for all strategies, automatically ensuring everything runs with the correct context. It returns an asynchronous generator that yields the results.

## Class WalkerLogicPrivateService

This service helps you compare different trading strategies against each other, essentially running a competition between them. It takes a stock symbol, a list of strategies you want to test, a metric to measure their performance (like profit or Sharpe ratio), and some contextual information about the testing environment.

It works by running each strategy one after another, using another service to handle the actual backtesting process. As each strategy finishes, you'll get updates on its progress. The service also keeps track of which strategy is performing the best in real-time. 

Finally, it gives you a complete report at the end, showing how all the strategies ranked against each other. Think of it as a behind-the-scenes engine for running strategy comparisons and providing you with a clear picture of which ones are outperforming others. 

It relies on a logger for recording events, and other services to handle the backtesting logic, markdown formatting and schema validation.

## Class WalkerCommandService

The WalkerCommandService acts as a central hub for interacting with the walker functionality within the backtest-kit framework. Think of it as a convenient way to access various services related to walkers, exchanges, frames, and strategies – all wrapped up for easy dependency injection.

It provides access to several internal services, including those responsible for logging, managing walker logic, validating strategies and exchanges, and more. 

The main thing you’ll likely use is the `run` method. This method lets you execute a walker comparison for a specific trading symbol, passing along contextual information like the walker's name, the exchange used, and the frame it operates within. The result of this comparison is returned as a stream of `WalkerContract` objects.

## Class StrategyValidationService

The StrategyValidationService helps ensure your trading strategies are set up correctly before you start backtesting. It keeps track of your strategy definitions and validates them. 

You can add strategy schemas to the service, allowing it to manage and check them. The core function is the `validate` method, which verifies that a strategy exists and confirms its risk profile is properly configured.  

If you need to see what strategies are currently registered, the `list` method provides a quick overview. Essentially, it's a central place to manage and confirm the integrity of your strategies before they'll be used for backtesting.

## Class StrategySchemaService

The StrategySchemaService helps you keep track of your trading strategies and their configurations in a structured way. It acts like a central hub where you register your strategies, ensuring they are properly defined and consistent.

You can add new strategies using `addStrategy()`, which internally uses a type-safe system to store them. To find a strategy later, you simply use its name to retrieve it.

Before a strategy is officially registered, it's checked to make sure it has all the necessary parts and is set up correctly with `validateShallow`. If you need to update a strategy that's already registered, you can use `override` to make partial changes, like updating a parameter value.

## Class StrategyGlobalService

The StrategyGlobalService acts as a central hub for managing and executing strategies within the backtesting framework. It combines a connection service with execution context to ensure strategies have the right information, like the trading symbol and date, when they run.

It's responsible for validating strategies and their risk configurations, making sure they're set up correctly. To speed things up, this validation is cached, so you don't have to repeat it unnecessarily. You'll also find logging to track validation activity.

You can use it to retrieve the most recent pending signal for a specific trading symbol. This is helpful for keeping tabs on things like stop-loss and take-profit orders.

The `tick` function lets you check the status of a strategy at a particular moment in time, and the `backtest` function performs a quick backtest using historical candle data.

If you need to temporarily pause a strategy from producing new signals, the `stop` function provides a way to do so. Finally, the `clear` function removes a strategy from the system’s memory, forcing it to reinitialize the next time it’s used.

## Class StrategyConnectionService

The StrategyConnectionService acts as a central hub, directing all actions to the correct trading strategy based on the symbol and strategy name being used. It's designed to be efficient, remembering which strategy implementations it's already working with so it doesn't have to recreate them unnecessarily.

Before you can use it, the service needs to be initialized. It also helps manage the lifecycle of strategies, providing ways to stop them from generating new signals or to clear them from memory entirely, which is helpful for resetting or freeing up resources.

You can use the `tick` function to execute a live trading tick, and `backtest` to evaluate a strategy against historical data, both of which wait for the strategy to be ready before proceeding. The `getStrategy` function retrieves the strategy instance, and the `getPendingSignal` function helps monitor things like stop-loss and take-profit orders.

## Class SizingValidationService

The SizingValidationService helps ensure your trading strategies have valid sizing rules defined. It acts as a central place to manage and check these rules. 

You can add sizing schemas, which define how much capital your strategy will use for each trade. The service lets you validate that a particular sizing has been defined and optionally checks if the sizing method is acceptable. 

It also allows you to list all the sizing schemas that have been registered, giving you a clear overview of your strategy's sizing configuration. This helps prevent errors and ensures your trades are properly sized according to your intended rules.


## Class SizingSchemaService

This service helps you keep track of your sizing schemas, which define how much of an asset to trade. It's designed to be type-safe, meaning it helps prevent errors by ensuring your schemas have the expected structure.

You can add new sizing schemas using `register`, update existing ones using `override`, and retrieve them by name using `get`. Think of it like a central repository for all your sizing rules. 

It uses a tool registry to keep everything organized and includes a validation step to check that your sizing schemas have the required information before they’re stored. This helps ensure consistency and accuracy in your trading strategies.


## Class SizingGlobalService

The SizingGlobalService is a central component that handles how much of an asset your trading strategy buys or sells. Think of it as the engine calculating the right size for each trade, based on your risk tolerance and other factors.

It relies on other services – a connection service for the actual sizing calculations and a validation service to make sure everything is set up correctly.  The `calculate` method is the key function; you'd use it (though typically indirectly through the backtest-kit framework) to determine the position size, providing details about the trade and the context it’s occurring in. This service is designed for internal use within the backtest-kit, streamlining the sizing process for your strategies.


## Class SizingConnectionService

The SizingConnectionService acts as a central hub for all position sizing calculations within the backtest kit. It intelligently directs sizing requests to the correct sizing method, ensuring that the right calculations are performed based on your strategy's configuration. 

Think of it as a dispatcher – you tell it which sizing method you want to use (by name), and it handles the rest. To optimize performance, it remembers which sizing methods you’ve already used, so it doesn't have to recreate them every time.

This service takes care of the heavy lifting, letting you focus on defining your strategy's sizing logic. It supports various sizing methods such as fixed-percentage, Kelly Criterion, and ATR-based sizing. It uses a `sizingName` parameter to route requests, and provides an empty string when sizing is not configured for a strategy.

## Class ScheduleUtils

ScheduleUtils helps you keep track of your scheduled trading signals and provides easy-to-understand reports. It's like a central hub for monitoring how your scheduled strategies are performing.

Think of it as a tool to see what signals are waiting to be executed, if any have been cancelled, and how long they're typically waiting. 

You can use it to get detailed statistics for a specific trading symbol and strategy, or to generate a complete markdown report outlining all scheduled events. Finally, it can save these reports directly to your hard drive for later review. It's designed to be easy to use and gives you a clear picture of your scheduled trading activity.

## Class ScheduleMarkdownService

This service helps you keep track of your trading signals by automatically creating reports. It listens for when signals are scheduled and cancelled, gathering information about each event. These events are organized by strategy and symbol, and then turned into easy-to-read markdown tables.

You can get statistics like cancellation rates and average wait times from these reports, which can help you understand how your strategies are performing.  The reports are saved as markdown files in the `logs/schedule/{strategyName}.md` directory.

The service handles its own initialization, so you don't need to worry about setting it up. It relies on a logger for debugging and uses a clever system to manage the storage of data for each strategy and symbol combination. You can also clear the accumulated data if you need to start fresh.


## Class RiskValidationService

The RiskValidationService helps you ensure your trading strategies are adhering to defined risk profiles. It's a tool for managing and verifying these risk rules.

You can think of it as a central place to define what constitutes acceptable risk and then check if your trading activity falls within those boundaries.

First, you add risk schemas, essentially defining the rules you want to enforce. Then, you use the `validate` function to check if a specific risk profile exists. Finally, the `list` function allows you to view all the risk schemas you've registered. This service helps maintain a clear and controlled approach to risk management within your backtesting framework.

## Class RiskSchemaService

The RiskSchemaService helps you organize and manage your risk schemas in a structured and type-safe way. It acts as a central place to store and retrieve these schemas, ensuring consistency in your trading strategies. 

You can think of it as a library where you register different risk profiles and then easily look them up when needed. The service uses a special registry to keep track of everything, and it even does a quick check to make sure each schema has the necessary information before it's added. You can also update existing schemas with just the parts that need changing. Finally, you can get a specific risk schema by its name to use in your backtesting or live trading.

## Class RiskGlobalService

This service acts as a central point for managing risk checks within the backtest-kit trading framework. It handles validating risk configurations and interacting with a risk connection service. Think of it as the gatekeeper, ensuring trades adhere to pre-defined risk limits.

It keeps track of open and closed signals, registering them with the risk management system. You can clear risk data, either for all risk instances or for a specific one, providing a way to reset the system. The validation process is optimized to avoid unnecessary checks, and logging keeps you informed about validation activity. It's a core component used both internally within strategies and by the public API.


## Class RiskConnectionService

The RiskConnectionService acts as a central hub for managing risk checks in your backtesting system. It makes sure risk assessments are directed to the correct risk implementation based on a name you provide. To speed things up, it remembers previously used risk implementations, so you don't have to recreate them every time.

When performing a risk check, use the `checkSignal` method to see if a trade should be allowed based on your risk limits. The service handles checking things like portfolio drawdown, how much you're exposed to any one symbol, position count, and daily loss limits.

You can also register and unregister signals with the system using `addSignal` and `removeSignal`, again ensuring the correct risk checks are performed.

If you need to clear the cached risk implementations – perhaps to force a refresh – use the `clear` method. Optionally, you can specify a `riskName` to clear only that specific implementation.

## Class PositionSizeUtils

This utility class helps you figure out how much to trade based on different strategies. It offers a few pre-built methods for calculating position sizes, like using a fixed percentage of your account, applying the Kelly Criterion, or basing the size on the Average True Range (ATR).

Each method takes information like your account balance, the price of the asset, and other relevant data to determine the appropriate position size. Importantly, these methods include checks to ensure the information you provide is suitable for the sizing technique you're using.

Think of it as a toolkit to help you automate and standardize your position sizing decisions, with each method acting as a ready-to-use formula.


## Class PersistSignalUtils

This class, PersistSignalUtils, helps manage and store signal data, particularly for trading strategies. Think of it as a secure and reliable way to save the current state of a strategy so it can pick up where it left off, even if there's a system interruption.

It automatically handles storage for each strategy, and you can even customize how it stores data using adapters. 

The `readSignalData` method retrieves previously saved signal data, allowing strategies to resume operations correctly. Conversely, `writeSignalData` ensures that new signal data is saved safely, preventing data loss in case of unexpected crashes.  It uses special techniques to ensure that writes are completed safely.

If you need to use a different method for saving data, you can register a custom adapter.


## Class PersistScheduleUtils

This class helps manage how your trading strategies remember their scheduled signals, ensuring they don't get lost if something goes wrong. It keeps track of storage instances separately for each strategy you're using.

You can customize how this data is stored by using your own adapter, allowing you to tailor the persistence to your specific needs. The class handles reading and writing this scheduled signal information to disk, making sure the process is reliable and prevents data corruption, particularly in case of crashes.

When a strategy starts, it reads in previously saved scheduled signals; when it changes a scheduled signal, it saves that change to disk. The read and write operations happen in a secure way, so your data stays safe.

## Class PersistRiskUtils

This class, PersistRiskUtils, helps manage how your trading positions are saved and restored, particularly for different risk profiles. Think of it as a safe keeper for your active trading data.

It intelligently stores these positions, making sure each risk profile has its own dedicated storage. You can even plug in your own custom ways to handle the storage if you need something different than the default.

When your system starts up, it reads the saved positions to get everything back to where it was. If there are no saved positions, it just starts with a clean slate. 

Whenever a signal is added or removed – essentially changing your active positions – this class makes sure that data is safely written back to disk. It does this carefully, using techniques to prevent data loss even if something goes wrong during the writing process.

Finally, you have the flexibility to register your own persistence adapters, giving you even more control over how your trading data is handled.

## Class PersistPartialUtils

This class, PersistPartialUtils, helps manage how partial profit and loss information is saved and restored, especially for live trading. It makes sure that even if your application crashes, you don't lose track of your progress.

It automatically handles saving and loading this partial data for each trading symbol, and it's designed to be reliable, using techniques that prevent data corruption. 

You can even customize how this data is stored by providing your own persistence adapter.

The `readPartialData` function retrieves saved partial data for a specific symbol. The `writePartialData` function saves changes to this data to disk in a safe way.

## Class PerformanceMarkdownService

This service helps you understand how your trading strategies are performing. It gathers data about your strategies as they run, tracking key metrics and calculating things like average returns, maximum drawdowns, and percentiles. 

The service organizes this information separately for each combination of trading symbol and strategy name, ensuring that data doesn't get mixed up. You can then request this aggregated data or generate detailed markdown reports that pinpoint areas where your strategies might be struggling. These reports, including bottleneck analysis, are automatically saved to your logs directory.

It’s designed to be initialized once, and provides a way to clear all the accumulated performance data when needed.  The service uses a logger to provide debug output and relies on a helper function to manage the storage of performance data. The `track` function is the core mechanism for feeding performance events into the service.

## Class Performance

The Performance class offers tools to understand how your trading strategies are performing. It allows you to collect and analyze performance data for specific symbols and strategies, giving you insights into their efficiency.

You can retrieve detailed performance statistics, organized by different operation types, to see how long each step takes and identify potential bottlenecks. The class also generates human-readable markdown reports that visually represent the performance data, including time distribution breakdowns and percentile analysis to pinpoint areas for improvement.

Finally, you can easily save these reports to disk for later review or sharing. If you don't specify a path, the report will be saved in a default directory named `./dump/performance/{strategyName}.md`.

## Class PartialUtils

This class helps you analyze and report on partial profit and loss events within your backtesting or trading system. Think of it as a way to get a detailed breakdown of smaller gains and losses that contribute to your overall results.

You can use it to get statistical summaries, like the total number of profit and loss events, for a specific symbol and strategy. It also creates nicely formatted markdown reports that show a table of these events, including details like the action (profit or loss), symbol, strategy, signal ID, position, level, price, and timestamp. 

Finally, it can easily export these reports to files on your computer, creating organized documents for each symbol and strategy combination.  The reports are saved as markdown files, making them easy to read and share.

## Class PartialMarkdownService

The PartialMarkdownService helps you keep track of and report on smaller, incremental profits and losses during backtesting. It listens for events representing these gains and losses, organizing them by the trading symbol and the strategy being used. 

It automatically creates reports in markdown format, making it easy to review the details of each symbol-strategy pairing. The service also provides summary statistics like total profit/loss events. Reports are saved to disk, and the service handles creating the necessary directories to store them. 

You can clear the accumulated data when needed, either for a specific symbol and strategy or globally. The service initializes itself automatically when you first use it, subscribing to the necessary event streams.

## Class PartialGlobalService

This service manages the tracking of partial profits and losses, acting as a central point for these operations. It's designed to be injected into your trading strategy, providing a clean way to handle partial profit/loss calculations and monitoring.

Think of it as a middleman: it receives requests from your strategy, logs them for tracking purposes, and then passes them on to the connection service that actually handles the details. This keeps your strategy code cleaner and simplifies debugging by providing a single place to monitor partial profit/loss activity.

It relies on two injected services – a logger for recording what's happening and a connection service to manage the underlying connections. The `profit` and `loss` functions are used to record new profit or loss levels, while the `clear` function resets the partial state when a signal is closed.

## Class PartialConnectionService

The PartialConnectionService is designed to keep track of partial profits and losses for each trading signal. It acts like a central hub, ensuring that each signal has its own dedicated record of its performance.

Think of it as a factory and manager for smaller, individual trackers (ClientPartial instances). Each time a signal is encountered, this service either retrieves an existing tracker or creates a new one – it smartly remembers what it’s already created.

It's integrated into the larger trading system and handles logging and signaling events related to profit and loss. When a trade reaches a profit or loss threshold, or when a trade is closed, the PartialConnectionService takes care of updating the relevant information and making sure those changes are communicated to the rest of the system. Finally, it cleans up old data to prevent unnecessary memory usage.

## Class OutlineMarkdownService

This service helps organize and save the detailed conversations and data generated during backtesting, particularly useful when using AI-powered strategies. It automatically creates a structured directory to store system prompts, user inputs, and the final LLM output, making it easier to review and debug the AI's reasoning. 

The service uses a logger to manage this process and avoids accidentally overwriting existing data by checking if the directory already exists. It essentially provides a way to capture the entire interaction with the AI, including the initial setup, user questions, and the AI's resulting signal. 

The `dumpSignal` method is the core function; it takes the signal ID, conversation history, signal data and an optional output directory to create these markdown files.

## Class OptimizerValidationService

This service helps keep track of your optimizers, ensuring they’re properly registered and available for use in your backtesting system. Think of it as a central directory for your optimizers.

It allows you to add optimizers to this directory, making sure each optimizer has a unique name. You can also use it to quickly check if an optimizer is registered, and the system is designed to be fast even if you check frequently thanks to memoization.

If you need to see a complete list of all registered optimizers, this service provides a simple way to retrieve that information. 

Essentially, it’s a utility for managing and validating your optimizers, contributing to a more reliable backtesting process.

## Class OptimizerUtils

This section provides tools to work with generated trading strategies. 

You can use `getData` to retrieve information about strategies created by an optimizer, including their metadata and training data. Think of it as getting a report on what the optimizer produced. 

`getCode` allows you to generate the actual code for your strategy, combining all the necessary parts into a single, runnable file.

Finally, `dump` offers a convenient way to save the generated strategy code to a file, organizing it within a specified directory and naming it in a standard format. This lets you easily deploy or share your strategy.

## Class OptimizerTemplateService

The OptimizerTemplateService is the backbone for creating code snippets used in backtesting and strategy optimization. It's designed to work with the Ollama LLM to generate these snippets, handling everything from initial setup to detailed signal generation.

It offers several key features, including analyzing data across multiple timeframes (like 1-minute, 5-minute, and hourly intervals), structuring output as JSON for easy signal processing, and providing debug logging to help track the optimization process. The service also integrates with CCXT for exchange connectivity, enabling testing on platforms like Binance. Furthermore, it facilitates strategy comparison using a Walker-based approach.

The service generates various code components, including banners with necessary imports, messages for the LLM conversation to understand the data, configurations for comparing strategies, and the actual strategy code incorporating multi-timeframe analysis. It also handles exchange setup, timeframe configuration, and a launcher to run the optimization process. Finally, it provides helper functions for dumping data for debugging and generating text and JSON outputs from the LLM, with a specific JSON schema defined for trading signals outlining position, note, price levels, and estimated duration.

## Class OptimizerSchemaService

The OptimizerSchemaService helps you keep track of and manage the configurations used for optimizing your trading strategies. Think of it as a central place to store and organize how your optimizers are set up.

It lets you register new optimizer setups, ensuring they have the necessary information like a name, training range, data source, and instructions for creating prompts.  You can also retrieve a specific optimizer setup by its name.

If you need to adjust an existing setup, you can partially update it, blending in your changes with the original configuration.  The service validates the structure of your configurations to make sure everything's in order.

## Class OptimizerGlobalService

The OptimizerGlobalService acts as a central hub for working with trading optimizers, ensuring everything runs smoothly and securely. Think of it as a gatekeeper that checks things are valid before letting actions happen.

It handles logging operations, verifying that the optimizer you're trying to use actually exists, and then passing requests on to a specialized connection service. 

You can use this service to retrieve data related to optimizers, generate the complete code for a trading strategy based on an optimizer, or save the generated code to a file. It simplifies interacting with optimizers by handling common checks and validations for you. 

The service relies on a logger, an optimizer connection service, and a validation service to perform its tasks.

## Class OptimizerConnectionService

This service helps manage connections to your optimizers, making sure you don't create unnecessary connections and keeping things efficient. It acts as a central place to get optimizer clients, remembering previously created instances for faster access.

It simplifies the process of combining your custom templates with default settings for each optimizer. You can inject a logger to track what’s happening.

The `getOptimizer` method is the main way to get a connected optimizer; it caches instances based on the optimizer’s name.

`getData` allows you to pull data and create metadata for your strategies. 

`getCode` is used to generate the final, executable code for your trading strategy.

Finally, `dump` provides a convenient way to save that generated code to a file.

## Class LoggerService

The LoggerService is designed to provide consistent and informative logging throughout the backtest-kit framework. It’s essentially a central hub for logging messages, automatically adding relevant details like the strategy, exchange, frame, symbol, and time to each log entry.

You can use it to write general messages, debug information, or warnings, and it handles the context injection for you. If you don’t configure a specific logger, it will default to a “no-op” logger that doesn’t actually write anything.

If you want more control, you can plug in your own custom logger to handle the actual logging process. This allows you to direct logs to a file, a database, or any other destination you choose. The `setLogger` method is used to do this.

## Class LiveUtils

The LiveUtils class is your go-to helper for managing live trading sessions within the backtest-kit framework. Think of it as a central hub for streamlined live operations.

It offers a `run` method that’s like a continuously running process for trading—it never stops and is built to handle crashes gracefully, automatically restoring its state from saved data.

If you need a process to quietly run live trading without directly observing the results, the `background` method is perfect for tasks like persistent logging or callbacks.

Want to check how your live trading is performing? `getData` retrieves statistics, while `getReport` generates a nicely formatted markdown report summarizing all the activity for a particular trading strategy and symbol. 

Finally, `dump` provides a simple way to save those detailed reports to a file, so you can review them later. This entire class is designed to be easily accessible and consistently available throughout your live trading workflows.

## Class LiveMarkdownService

The LiveMarkdownService helps you automatically create reports about your trading strategies as they run. It keeps track of all the events – when a strategy is idle, when it opens a position, when it’s active, and when it closes. These events are then compiled into easy-to-read markdown tables, complete with useful statistics like win rate and average profit.

This service listens for signals from your strategies, accumulating data for each trading pair (symbol and strategy). It neatly organizes this information and saves it as markdown files in a dedicated logs directory, allowing you to easily review performance. You can also clear the stored data if needed, either for a specific trading pair or all of them.

The service handles the tricky parts of setting up and subscribing to these signals automatically, ensuring it’s ready to go when you need it, and only runs the initialization process once. It relies on a logger service for debugging output and uses a special storage mechanism to keep data for each trading pair separate.

## Class LiveLogicPublicService

This service helps manage live trading operations, simplifying the process by automatically handling important context information like the strategy and exchange being used. It’s designed to run continuously, producing a stream of trading signals – whether a position is being opened or closed – without you having to repeatedly pass context details around.

The service is resilient; if things go wrong and the process crashes, it will automatically recover and resume from where it left off, preserving its state. You can think of it as a persistent, always-on engine for live trading, taking care of the background management so you can focus on the trading logic itself. It uses a special technique to generate trading results continuously.



It relies on other services for logging and the core live trading logic, making it a coordinated part of a larger system.

## Class LiveLogicPrivateService

This service is designed to handle the continuous, real-time execution of your trading strategies. It acts as the engine that constantly monitors the market and generates trading signals. 

Think of it as an infinite loop, checking for new signals and immediately reporting when a trade is opened or closed. It's built to be efficient in how it uses memory, streaming results as they become available rather than storing everything.

If things go wrong and the process crashes, it automatically recovers and picks up where it left off, ensuring uninterrupted trading. To get things running, you simply tell it which asset (symbol) you want to trade, and it will start generating a stream of trading results.

## Class LiveCommandService

This service provides a straightforward way to access and manage live trading operations within the backtest-kit framework. Think of it as a central hub, handling the behind-the-scenes coordination for your live trading strategies. It's designed to be easily integrated into your application using dependency injection.

Inside, it manages several related services like logging, validation, and schema handling, all working together to ensure a smooth trading experience.

The key function, `run`, is your primary tool for initiating live trading. You provide the symbol you want to trade and some context—like the names of your strategy and exchange—and it returns an ongoing stream of results, constantly updating with trading events. The `run` function is designed to be resilient, automatically recovering from errors and keeping the trading process going.

## Class HeatUtils

This class offers a simple way to generate and save portfolio heatmaps, which are visual representations of your trading strategy's performance. Think of it as a tool to quickly understand how well different assets performed within a specific strategy.

You can use it to retrieve the underlying data that powers the heatmap, allowing you to dig deeper into the statistics for each asset.  It automatically pulls together performance data like total profit/loss, Sharpe Ratio, and maximum drawdown across all closed trades within a strategy.

Need a nicely formatted report? The `getReport` method creates a markdown table showing this data, sorted by profitability. Finally, you can easily save this report to a file on your computer using the `dump` method. The class acts as a central place to access this functionality, ensuring a consistent approach to analyzing your strategies.

## Class HeatMarkdownService

This service helps visualize and analyze your trading strategies by creating portfolio heatmaps. It gathers data about closed trades, calculating important metrics like profit/loss, Sharpe Ratio, and maximum drawdown for each symbol and across your entire portfolio.

Think of it as a central dashboard that takes information from your trading signals and turns them into easy-to-understand reports.

It creates separate storage for each strategy, ensuring that the data remains isolated and organized. You can retrieve the aggregated statistics using the `getData` method, or generate a well-formatted markdown report with `getReport` to share or save. The data can be saved to disk with `dump`.

To clean up old data, you can use the `clear` function, either for a specific strategy or all of them.  The `init` function sets up the service to listen for trading signals, but it automatically handles the setup for you the first time you use it.

## Class FrameValidationService

The FrameValidationService helps you ensure your trading strategies are using the correct data structures. Think of it as a gatekeeper for your frames, making sure everything is set up correctly before your backtest begins.

You start by telling the service about the different frames your system uses, along with their expected format – this is done using `addFrame`. The `validate` method then checks if a specific frame exists. 

If you need to see all the frames the service is managing, `list` provides a simple way to get a list of all registered schemas. It essentially helps you avoid data errors and ensures your backtesting environment is stable.

## Class FrameSchemaService

The FrameSchemaService helps you keep track of your trading strategy's data structures, ensuring they're consistent and well-defined. It acts like a central library for your frame schemas, allowing you to register new ones, update existing ones, and easily retrieve them when needed. 

It uses a specialized registry to store these schemas in a type-safe way. Before a new schema is added, it performs a quick check to make sure all the necessary parts are present and of the expected types.

You can add new schemas using the `register` method, update existing ones with `override`, and get a schema by its name using `get`. Think of it as a way to organize and manage the blueprints for your trading data.

## Class FrameGlobalService

FrameGlobalService helps manage and generate the timeframes your backtesting process uses. Think of it as a central point for getting the dates and times you're going to be testing your strategies against. It works closely with the connection service to fetch this information and ensures the timeframes are valid for your data.  Essentially, it provides a convenient method, `getTimeframe`, to get the specific dates you need based on the symbol and timeframe name you specify.  The service also keeps track of logging and validation components for its operations.

## Class FrameConnectionService

The FrameConnectionService acts as a central hub for managing and accessing different trading frames, like minute, hourly, or daily data. It automatically figures out which frame you're working with based on the current context. 

To avoid repeatedly creating these frames, it keeps a cached copy of each one, speeding things up. It's designed to handle backtesting scenarios, allowing you to define a specific start and end date for your simulations. 

When in live trading mode, it doesn't apply any frame constraints. 

You can request a specific frame using the `getFrame` method, which creates it if it doesn’t already exist. 

The `getTimeframe` method lets you retrieve the date range (start and end dates) associated with a particular symbol and frame – useful for limiting your backtest to a specific period. 

It relies on services like the logger, frame schema, and method context to function correctly.

## Class ExchangeValidationService

The ExchangeValidationService helps you keep track of and verify the structure of your exchange data. Think of it as a central place to define what a valid exchange looks like.

You can add different exchange types, each with its own specific rules, by using the `addExchange` method. The `validate` function then lets you check if a particular exchange data conforms to its defined schema. 

If you need to see what exchanges you've registered and their associated schemas, the `list` method provides a convenient way to retrieve that information. The service also incorporates a logger to help with troubleshooting and tracking validation activities.

## Class ExchangeSchemaService

This service helps you keep track of information about different cryptocurrency exchanges in a structured and reliable way. It acts as a central place to store and manage these exchange details, ensuring consistency across your backtesting system.

You can add new exchange information using the `addExchange` function, and then easily find it again by its name using the `get` function. Before adding a new exchange, the system will quickly check to make sure it has all the necessary pieces of information using `validateShallow`.  If an exchange already exists, you can update parts of its information without replacing the entire entry, thanks to the `override` function. The system utilizes a type-safe registry to keep everything organized, and a logger service to help with debugging.

## Class ExchangeGlobalService

The ExchangeGlobalService acts as a central hub for interacting with exchanges within the backtest-kit framework. It combines the functionality of exchange connections with the ability to inject crucial information like the trading symbol, the specific time, and backtest parameters into each operation.

Think of it as a middleman, making sure every request to the exchange has all the necessary context for accurate and consistent results. It's a core component used internally by other services to manage trading logic.

You're unlikely to use this class directly, as it's primarily designed to be used behind the scenes.

It includes features for fetching historical and future candle data, calculating average prices, and formatting price and quantity values, all while ensuring the right context is applied to each request. Validation is also built in to ensure exchange configurations are correct and to avoid unnecessary repeated checks.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges. It simplifies the process of making requests, ensuring they're directed to the correct exchange based on your current context.

Think of it as a smart router – you specify what you want to do (like fetching candles or getting the average price), and it automatically figures out which exchange to use. It also keeps track of connections to each exchange, so it doesn't have to create new ones every time, making things faster.

It provides several key functions:

*   **Fetching Historical Data:** You can easily get historical candlestick data for a specific cryptocurrency and timeframe.
*   **Getting Future Data:** Retrieve the next batch of candlestick data after a defined timestamp.
*   **Calculating Average Price:** Obtain the current average price, whether you're doing a backtest (using historical data) or live trading (fetching from the exchange).
*   **Formatting Prices and Quantities:** It automatically adjusts prices and quantities to match the specific formatting rules of the exchange you’s using, ensuring your orders are valid.

## Class ConstantUtils

This class provides a set of predefined values that are useful for setting take-profit and stop-loss levels in your trading strategies. These values are derived from the Kelly Criterion and incorporate an exponential risk decay approach, designed to help manage risk and maximize potential profit.

The take-profit levels – TP_LEVEL1, TP_LEVEL2, and TP_LEVEL3 – represent percentages of the total distance to your final take-profit target, enabling you to lock in portions of your profit as the price moves favorably. For instance, TP_LEVEL1 triggers when the price reaches 30% of the way to your target.

Similarly, the stop-loss levels – SL_LEVEL1 and SL_LEVEL2 – provide percentages of the total distance to your final stop-loss target. SL_LEVEL1 gives an early warning of a weakening trade setup, while SL_LEVEL2 ensures you exit the remaining position before significant losses accumulate.

## Class ClientSizing

This component, ClientSizing, helps determine how much of your assets to allocate to a trade. It's designed to be flexible, letting you choose from several sizing approaches like fixed percentages, the Kelly Criterion, or using Average True Range (ATR). You can also set limits on the minimum and maximum position sizes, as well as a cap on the percentage of your capital used in a single trade. 

The ClientSizing component gives you the ability to add custom checks or logging to the sizing process, helping you validate the calculated position sizes and keep track of what’s happening. Ultimately, it takes the information about your strategy and market conditions and outputs the appropriate position size for a trade. 

The `calculate` method is the core of this component – it's what does the actual sizing calculation, taking into account all the configured parameters and constraints.

## Class ClientRisk

ClientRisk helps manage risk across your trading strategies. It acts as a gatekeeper, preventing signals from being executed if they would violate predefined limits, like the maximum number of positions you can have open at once. This is especially useful when using multiple strategies simultaneously, as it allows for a holistic view of your portfolio’s risk exposure.

Think of it as a central risk manager that all your strategies consult before taking action. It keeps track of all open positions, and allows you to set up custom checks to enforce your specific risk rules.

Behind the scenes, it monitors active positions and can load them from persistent storage, although this feature is bypassed during backtesting.

The `checkSignal` method is the core of its function – it evaluates each signal against your risk rules, and it will alert you if a signal is blocked.  It also provides a way to register and remove signals as they are opened and closed, ensuring the tracked data remains accurate.

## Class ClientOptimizer

The `ClientOptimizer` is the workhorse for running optimization processes. It gathers data from various sources, breaks it down into manageable chunks, and prepares it for use by an AI model. It’s responsible for constructing the conversation history that the AI uses to refine trading strategies. 

You can think of it as a pipeline: it takes a symbol like "AAPL," pulls in the necessary data, builds the groundwork for the AI's learning process, and then crafts the complete trading strategy code. 

The `getData` method is used to retrieve and process the data needed for the optimization process. The `getCode` method builds the finished, runnable trading strategy.  Finally, the `dump` method allows you to save the generated code to a file, essentially creating a ready-to-use trading strategy.

## Class ClientFrame

The ClientFrame is the workhorse for creating the timelines your backtesting uses. Think of it as the engine that generates the sequences of dates and times your trading strategies will run against. It's designed to be efficient, remembering previously calculated timelines to avoid unnecessary work. 

You can tailor the spacing of these timelines, setting them from one-minute intervals up to three-day gaps.  It can also be customized to run validation checks or record data as the timelines are built. 

The `getTimeframe` function is key here – it’s what actually creates these timelines, and it intelligently caches the results so it doesn’t repeat calculations. The `params` property holds all the initial configuration used when the ClientFrame is set up.

## Class ClientExchange

This class, `ClientExchange`, provides a way to access and format data from an exchange, specifically designed for backtesting scenarios. It acts as a bridge, providing methods to retrieve historical and future candle data, calculate VWAP, and properly format price and quantity values for exchange compatibility. 

You can use it to get past candle data, look ahead to future candles needed for signal generation, and determine the average price based on recent trading activity. The VWAP calculation considers volume to give a weighted average, and falls back to a simple close price average if volume data is unavailable. The class also provides methods for ensuring prices and quantities are formatted correctly for the specific exchange you're working with. It's built to be efficient in memory usage by using prototype functions.

## Class BacktestUtils

This class provides helpful tools for running and analyzing backtests within the framework. 

You can easily kick off a backtest using the `run` method, which handles the underlying execution and provides logging for you.  If you just want a backtest to run in the background without needing to see the results directly – perhaps for logging or triggering callbacks – use `background`. 

To grab pre-calculated statistics about a backtest after it's finished, use `getData`. Need a nicely formatted report you can share? `getReport` creates a markdown document summarizing the backtest results. Finally, `dump` lets you save those reports directly to your computer. It’s designed to be accessible throughout the system.

## Class BacktestMarkdownService

This service helps you create easy-to-read reports about your backtesting results. It automatically tracks closed trading signals for each strategy you're testing. Think of it as a recorder that captures the final outcome of each trade.

It gathers information about closed trades and organizes them into markdown tables – which are easily formatted and readable documents. The service saves these reports as `.md` files in a `logs/backtest` directory, making it simple to review your backtesting performance.

The `init` function sets up the service, ensuring it’s ready to collect data. It handles the setup automatically, so you don’t have to worry about manual configuration. You can clear the collected data with the `clear` function, either for a specific strategy and symbol or to erase everything. To get the raw statistical data or a full report, you can call `getData` or `getReport` respectively. Finally, `dump` saves the generated report to disk.

## Class BacktestLogicPublicService

The `BacktestLogicPublicService` is designed to make running backtests easier by automatically managing important context information like the strategy name, exchange, and frame. Think of it as a helpful layer on top of the core backtesting logic. 

You don’t have to pass this context around manually with every function call; it’s handled behind the scenes. It uses a `loggerService` and interacts with a `backtestLogicPrivateService` to perform the actual backtesting.

The main method, `run`, lets you start a backtest for a specific symbol. It returns results as a stream, which is a convenient way to process them step-by-step. This stream provides results and the context is automatically available to all functions used during the backtest.

## Class BacktestLogicPrivateService

This service helps orchestrate your backtesting process, especially when dealing with lots of data. It's designed to be memory-friendly by streaming backtest results instead of building up huge arrays. 

The service gets timeframes from your data source, then it goes through each timeframe, checking for trading signals. When a signal tells your strategy to open a position, it fetches the necessary historical data and runs the backtest logic.  It efficiently skips forward in time until the signal tells the strategy to close the position.  

Finally, it yields a result representing the closed position, and then continues the process with the next timeframe. You can stop the backtest early by simply breaking out of the loop that's consuming the generated results.

The service also has some internal dependencies, including services for logging, managing strategy-related data, interacting with the exchange, retrieving data frames, and providing method context. The main method you’ll use is `run`, which takes a symbol as input and returns an asynchronous generator that produces backtest results.

## Class BacktestCommandService

This service acts as a central hub for running backtests within the framework. Think of it as the go-to place to initiate a backtest and coordinate all the necessary components. It handles dependency injection, making it easier to manage the different parts involved in the backtesting process. 

The `run` method is your primary tool – it’s how you tell the system to perform a backtest for a specific trading symbol, providing details about the strategy, exchange, and data frame being used. The service orchestrates the backtest execution and returns the results in a structured way. It relies on other services like `strategySchemaService` and `exchangeValidationService` to ensure everything is set up correctly before the backtest begins.

# backtest-kit interfaces

## Interface WalkerStatistics

The `WalkerStatistics` interface is designed to hold the overall results when you're comparing different trading strategies. Think of it as a container for all the information you need to understand how your strategies performed against each other. 

It builds upon the `IWalkerResults` interface and adds a crucial piece: `strategyResults`. This `strategyResults` property is an array containing detailed results for each individual strategy you tested, allowing you to easily compare their performance metrics. It's particularly useful when you’re using markdown services to present and analyze your backtesting data.

## Interface WalkerContract

The WalkerContract represents updates as your trading strategies are being compared against each other. It provides information about each strategy's completion, including its name, the exchange and frame it was tested on, and the symbol being analyzed.

You're given details about the strategy’s performance, like its statistics and a specific metric value that's being optimized. 

This contract also tracks the overall progress of the comparison: how many strategies have been tested, the total number of strategies involved, and the current best-performing strategy found so far based on the target metric. Essentially, it's a way to monitor your strategy comparison process and see how your strategies stack up.

## Interface TickEvent

This interface, TickEvent, is designed to provide a consistent structure for all the data points related to a trading event, regardless of what's happening – whether it's a signal appearing, a trade opening, or a position closing. Think of it as a single container for all the important information you'll need to understand what's going on in your backtesting results.

The `timestamp` tells you exactly when the event occurred, and the `action` clarifies the type of event happening (idle, opened, active, or closed). When a trade is involved, you'll find details like the `symbol` being traded, the `signalId` that triggered it, the `position` being held (long or short), and a `note` associated with the signal.

For open positions, you’ll see the `openPrice`, `takeProfit` level, and `stopLoss` price. When a position closes, you get the `closeReason`, the `duration` the trade was open, and the calculated `pnl` (profit and loss) as a percentage. Essentially, TickEvent brings together all the key information needed to analyze and report on your trading activity.

## Interface ScheduleStatistics

This data provides insights into how your scheduled signals are performing. You’re given a complete list of events, whether they were successfully scheduled or cancelled, alongside the total count of all events. It also shows you the total number of signals that were scheduled and the number that were cancelled.

A key metric is the cancellation rate, which tells you the percentage of scheduled signals that were cancelled – a lower rate generally indicates better signal quality. Finally, if you have cancelled signals, you'll see the average waiting time for those cancellations, helping you understand delays in the system.

## Interface ScheduledEvent

This interface holds all the essential details about scheduled and cancelled trading signals, making it easy to generate reports and understand what happened. 

You'll find information like when the event occurred (timestamp), what type of action it was – whether it was scheduled or cancelled. 

Each event is associated with a specific trading pair (symbol) and has a unique signal ID. 

It also includes details about the trade itself, such as the position type, any notes associated with the signal, the market price at the time, planned entry, take profit, and stop-loss prices. 

For cancelled signals, you're given the close timestamp and the duration of the trade before cancellation.

## Interface ProgressWalkerContract

This interface describes the updates you'll receive as a backtest kit walker runs in the background. It's like getting little progress reports letting you know how far along the process is. Each update includes the name of the walker, the exchange being used, the frame, and the trading symbol. You’ll also see the total number of strategies the walker needs to evaluate, how many it’s already finished, and a percentage indicating overall completion. This lets you monitor the backtesting process without blocking your main application.

## Interface ProgressOptimizerContract

This interface lets you keep an eye on how your trading optimizer is doing. It provides updates during the optimization process, giving you information about the overall workload and what’s been completed.

You'll see the name of the optimizer running, the trading symbol it's analyzing (like BTCUSDT), and the total number of data sources it needs to work through.  It also tells you how many sources have already been processed and the overall percentage of the task that’s finished, ranging from 0% to 100%. This allows you to monitor progress and get a sense of how long the optimization might take.

## Interface ProgressBacktestContract

This interface describes what you're seeing as your backtest runs. It provides updates on how far along the process is, broken down by exchange, strategy, and the specific trading symbol being tested. 

You'll see details like the total number of historical data points the backtest will analyze, how many it's already processed, and a percentage indicating overall completion. Think of it as a progress bar giving you a clear view of the backtest's advancement. Each update contains the exchange used, the strategy employed, the trading symbol being tested, the total data points, what's been processed, and a percentage showing how close the backtest is to finishing.

## Interface PerformanceStatistics

This section describes the `PerformanceStatistics` object, which acts as a central container for all the performance data collected during a backtest. It holds information about the strategy being tested, the overall number of events processed, and the total time spent calculating metrics. 

The `metricStats` property is key – it breaks down the performance data further, organizing it by the specific metric type (like profit, drawdown, etc.). If you need to see the raw data, the `events` property holds a list of all the performance events recorded, providing a detailed view of individual data points. The `strategyName` identifies the strategy that generated this data, while `totalEvents` and `totalDuration` give a general sense of the backtest’s scale and processing time.

## Interface PerformanceContract

The PerformanceContract helps you understand how your trading strategies are performing. It records key data points, like when an action took place and how long it took to complete. 

You’re given the type of action being measured (for example, order placement or market data update), along with the strategy and exchange involved. The contract also tells you which symbol was being traded and whether the measurement occurred during a backtest or in a live trading environment. Having this information helps you pinpoint slow parts of your code, allowing you to optimize for speed and efficiency. The timestamp and previous timestamp fields let you track performance changes over time.

## Interface PartialStatistics

This interface holds key statistical information gathered from your backtesting process, specifically focusing on partial profit and loss events. It's a way to keep track of how your trading strategy performs at different milestones.

The `eventList` property gives you a complete record of each profit or loss event, allowing for deeper analysis. `totalEvents` simply tells you the total number of events that occurred.  You can then use `totalProfit` and `totalLoss` to see the overall balance of profit versus loss in your backtest.

## Interface PartialProfitContract

This interface represents a notification when a trading strategy hits a partial profit milestone, like 10%, 20%, or 30% profit. It's used to keep track of how your strategy is performing and when it's taking partial profits.

Each notification includes information about the trading pair (symbol), the details of the trade itself (signal data), the price at which the profit level was reached, the specific profit level achieved (e.g., 10%), and whether this event happened during a backtest or live trading.

The timestamp indicates when the profit level was detected, reflecting the moment in live mode or the candle timestamp during backtesting. The information is de-duplicated to avoid repeated notifications for the same signal.

## Interface PartialLossContract

The PartialLossContract represents notifications when a trading signal hits a partial loss level, like -10%, -20%, or -30%. This helps you keep track of how your strategy is performing and when stop-loss levels are triggered.

Each notification includes details like the trading pair's symbol, the complete signal data, the price at which the loss level was reached, and the specific loss level triggered (e.g., -20%). You'll also find a flag indicating whether the event came from a backtest or live trading, and a timestamp for precise timing information. Events are designed to be unique, with each signal only triggering a notification once per loss level.

## Interface PartialEvent

This `PartialEvent` object holds key details about profit and loss milestones during a trading simulation or live trading. Think of it as a snapshot of what happened at a specific moment – whether it was a profitable or loss-making event, which trading pair was involved, and the strategy that generated the trade. It records things like the exact time of the event, the market price at that time, the level of profit or loss achieved (like 10%, 20%, etc.), and whether the event occurred during a backtest or in real-time.  The `signalId` attribute helps trace the event back to the specific signal that triggered the trade. Finally, `position` indicates the type of position taken.

## Interface MetricStats

This object helps you understand how a particular performance metric is behaving over time. It gathers statistics like the number of times a metric was recorded, the total time it took across all instances, and key measurements such as the average, minimum, maximum, and standard deviation. 

You'll also find information about wait times – the gaps between events – giving you a more complete picture of the system's responsiveness. Percentiles, specifically the 95th and 99th, are included to highlight outlier performance and potential bottlenecks. Essentially, this object provides a comprehensive statistical summary of a specific metric's performance.

## Interface MessageModel

The MessageModel helps keep track of conversations when you're building trading strategies using backtest-kit. Think of it as a way to structure the back-and-forth between a user, a system giving instructions, and the AI assistant. Each message has a `role` to identify who sent it - whether it's the system setting the scene, a user's question, or the AI’s response.  The `content` property holds the actual text of that message, allowing you to build up a complete conversation history for your AI to work with.

## Interface LiveStatistics

The `LiveStatistics` interface gives you a detailed look at your live trading performance. It keeps track of every event that occurs during trading, from idle periods to signal closures. You're provided with a complete list of these events (`eventList`) and the total number of them (`totalEvents`).

Key metrics like win count (`winCount`), loss count (`lossCount`), and total PNL (`totalPnl`) are calculated to assess profitability. The win rate (`winRate`) shows the percentage of winning trades, while the average PNL (`avgPnl`) represents the average profit per trade.

To help gauge risk, the standard deviation (`stdDev`) provides a measure of volatility, and the Sharpe Ratio (`sharpeRatio` and `annualizedSharpeRatio`) factors in risk when evaluating returns. The certainty ratio (`certaintyRatio`) highlights the balance between winning and losing trades, and `expectedYearlyReturns` projects potential yearly profits. All numerical values are carefully managed, becoming null if a calculation is unreliable.

## Interface IWalkerStrategyResult

The `IWalkerStrategyResult` holds the outcome of running a single trading strategy during a backtest comparison. It tells you the name of the strategy that was tested, along with the statistical performance data generated by the backtest. You'll find a numerical metric value here, which is the core value used to evaluate and compare strategies against each other. Finally, the `rank` property shows you where this strategy landed in the overall performance ranking, with the best strategy being ranked as 1.

## Interface IWalkerSchema

The IWalkerSchema lets you set up A/B testing experiments for your trading strategies within backtest-kit. Think of it as a blueprint for how you want to compare different approaches.

You give it a unique name to identify the experiment, and you can add a note for yourself to explain what the test is for. 

It specifies the exchange and timeframe you'll be using for all the strategies involved. Most importantly, you tell it which strategy names to pit against each other – these strategies need to be registered beforehand.

You can choose what metric you want to optimize, like Sharpe Ratio, or provide your own custom metric. Finally, you can add callbacks to run custom code at different points in the testing process.

## Interface IWalkerResults

This interface holds all the information gathered when you run a walker, which is essentially a process of testing many different trading strategies. It tells you what strategy was tested, which market (symbol) and exchange were used, and what timeframe the tests were based on. 

You'll find the metric used for comparing strategies, along with the total number of strategies evaluated. The most important part is likely the details of the best-performing strategy – its name, the best metric score it achieved, and comprehensive statistics about its performance. This helps you quickly understand the results of your strategy comparison and identify promising approaches.

## Interface IWalkerCallbacks

This interface provides a way to be notified about what's happening during the backtesting process. Think of it as a listener for key events. 

You can use these callbacks to track the progress of your backtest, get notified when a strategy starts or finishes, and respond to any errors that might occur.  You'll also get a final notification when all the backtests are done, along with a summary of the results. This allows you to customize the backtesting experience and potentially log data or perform actions based on the progress.


## Interface IStrategyTickResultScheduled

This interface describes what happens within backtest-kit when a trading strategy generates a signal that needs to wait for a specific price to be reached before executing. Think of it as a notification that a trade is pending, held back until the market moves in the desired direction. 

The `action` property always indicates that this is a "scheduled" signal, meaning it's in a waiting state. The core information is contained within the `signal` property, which holds all the details about the trade that's on hold. You’ll also find useful tracking information like the strategy and exchange names, the trading symbol, and the price at which the signal was initially generated. This allows you to monitor and analyze why a particular trade was scheduled and when it eventually triggered.

## Interface IStrategyTickResultOpened

This interface represents the data you receive when a new trading signal is created within your backtesting strategy. It's a notification that a signal has been successfully validated and saved, marking the beginning of a trade. You'll find key details included, such as the name of the strategy that generated the signal, the exchange being used, the trading symbol (like BTCUSDT), the current price at the moment the signal opened, and the complete signal data itself, including a unique identifier. Think of it as a "new trade started" notification for your backtesting system.

## Interface IStrategyTickResultIdle

This interface represents what happens in your trading strategy when it's in an idle state – meaning there’s no active trading signal. It provides details about the situation at that moment, including the strategy's name, the exchange being used, the trading symbol (like BTCUSDT), and the current price. Essentially, it’s a record of when the strategy isn't actively making trades, giving you visibility into periods of inactivity. The `action` property clearly identifies this as an "idle" state, and the `signal` property is set to null to confirm the absence of a trading signal.

## Interface IStrategyTickResultClosed

This interface represents the outcome when a trading signal is closed, providing a complete picture of what happened and how it performed. It includes all the essential information about the closed signal, such as the original parameters, the final price used for calculation, and the reason for the closure – whether it was due to time expiration, a take-profit order, or a stop-loss event. 

You’ll also find details about when the signal was closed, the profit and loss realized (including fees and slippage), and identifiers for the strategy and exchange used. Essentially, it's a final report card for a closed trade, providing everything you need to analyze its success or identify areas for improvement. 

It tells you *what* was traded, *when* it closed, *why* it closed, and *how much* was earned or lost.

## Interface IStrategyTickResultCancelled

This interface describes what happens when a scheduled trading signal is cancelled – essentially, it didn’t lead to a trade. It’s used to report situations where a signal was planned but didn't actually result in opening a position, perhaps because it expired or hit a stop-loss before an entry could be made.

The data included tells you precisely which signal was cancelled, the price at the time of cancellation, when it was cancelled, and details about the strategy and exchange involved.  You’re getting a complete record of why a planned signal didn't execute, allowing you to analyze and potentially refine your trading strategies. The `action` property clearly identifies this as a cancelled signal.

## Interface IStrategyTickResultActive

This interface represents a tick result when a strategy is actively monitoring a signal, meaning it's waiting for a trade to be triggered by a take profit, stop loss, or time expiration. It contains all the key information about the situation – the signal being tracked, the current price being monitored, and details about the strategy, exchange, and the trading symbol involved. Essentially, it's a snapshot of what the strategy knows while it's waiting for the signal to resolve. You’ll find the signal details, the symbol being traded, and other relevant identifiers.

## Interface IStrategySchema

The `IStrategySchema` defines how your trading strategies work within the backtest-kit framework. Think of it as a blueprint for your strategy, telling the system what to do and when. 

Each strategy needs a unique name (`strategyName`) so the system can identify it. You can also add a helpful note (`note`) for yourself or other developers. 

`interval` controls how often your strategy can generate signals – it's a way to prevent it from overwhelming the system.  The core logic is in `getSignal`: this function is where you write code to analyze data and decide whether to buy or sell.  It can wait for a specific price to be reached, or execute immediately.

You can also specify optional callbacks (`callbacks`) for things like when a trade opens or closes. `riskName` allows you to associate your strategy with a specific risk profile.

## Interface IStrategyResult

The `IStrategyResult` helps you understand how your trading strategies performed. It bundles together a strategy's name, a comprehensive set of backtest statistics—think total profit, Sharpe ratio, and drawdown—and a key metric value used for ranking strategies against each other.  Essentially, this interface holds all the essential information to compare and evaluate your trading strategies in a clear and organized way. The metric value can be null, indicating that the strategy's results were not valid for ranking.

## Interface IStrategyPnL

This interface represents the profit and loss results for a trading strategy. It gives you a clear picture of how a trade performed, taking into account small fees and slippage that typically occur when executing trades. 

The `pnlPercentage` tells you the overall profit or loss as a percentage – a simple way to gauge the trade’s effectiveness. You'll also find `priceOpen`, which is the price at which the trade entered the market after accounting for fees and slippage.  Similarly, `priceClose` gives you the price at which the trade exited, also adjusted for those small costs.

## Interface IStrategyCallbacks

This interface lets you hook into different stages of your trading strategy's lifecycle. Think of it as a way to get notified about what's happening behind the scenes.

You can listen for every tick of data with `onTick`, receiving the result and knowing if it’s from a live or backtesting environment.  `onOpen` tells you when a new signal has been validated and is ready to be traded. `onActive` keeps you informed when the strategy is actively monitoring a signal. When there are no active signals, `onIdle` lets you know.  `onClose` provides the final price when a signal is finished.

For signals that are created but not immediately executed, `onSchedule` is triggered, while `onCancel` signals when a scheduled signal is dropped.  `onWrite` is for persisting data, primarily for testing purposes.

Finally, `onPartialProfit` and `onPartialLoss` provide updates on signals that are performing well (but haven't hit the take profit) or losing (but haven't hit the stop loss) respectively.

## Interface IStrategy

The `IStrategy` interface outlines the fundamental methods a trading strategy must have within the backtest-kit framework. 

A core method, `tick`, handles each individual update of market data, incorporating VWAP monitoring and checking for both signal generation and the potential for take-profit or stop-loss triggers. 

`getPendingSignal` allows you to inspect the current status of any ongoing trade signals for a specific symbol; if no signal is active, it returns nothing.

For quick assessments, the `backtest` method simulates strategy performance using historical candlestick data, calculating VWAP and evaluating TP/SL conditions along the way.

Finally, the `stop` method provides a way to pause the strategy from creating new signals, useful for controlled shutdowns while existing trades continue to run to completion.

## Interface ISizingSchemaKelly

This interface defines how to size your trades using the Kelly Criterion, a popular strategy for maximizing growth. When implementing this, you're telling the backtest-kit framework that you want to use the Kelly Criterion to determine how much of your capital should be allocated to each trade. The `kellyMultiplier` property is key; it controls the aggressiveness of the Kelly Criterion—a lower number (like the default of 0.25) means a more conservative approach, while a higher number suggests you're willing to risk more for potentially larger gains. This multiplier directly influences the size of your positions.

## Interface ISizingSchemaFixedPercentage

This schema defines a straightforward way to size your trades, consistently risking a fixed percentage of your capital on each one. It's perfect when you want a simple and predictable approach to position sizing.  The `method` property confirms you're using the fixed percentage sizing, and the `riskPercentage` tells the framework what percentage of your available funds you’re comfortable risking on each trade – a value between 0 and 100 represents the percentage.

## Interface ISizingSchemaBase

This interface, `ISizingSchemaBase`, defines the fundamental structure for sizing configurations within the backtest-kit framework. Think of it as the blueprint for how much of your account you're willing to risk on each trade. 

It includes key properties like `sizingName`, a unique identifier for easy reference, and a `note` field for developers to add helpful documentation.  You'll also find controls for position sizing: `maxPositionPercentage` sets the maximum risk as a percentage of your total account value, while `minPositionSize` and `maxPositionSize` define absolute minimum and maximum trade sizes.  Finally, `callbacks` allow you to add custom logic at different stages of the sizing process if you need more flexibility.

## Interface ISizingSchemaATR

This interface defines how to size your trades based on the Average True Range (ATR), a measure of volatility. 

When using this approach, you specify a `riskPercentage` which represents the portion of your capital you're willing to risk on each trade, expressed as a number between 0 and 100. 

You also define an `atrMultiplier`, which determines how much the ATR value influences the stop-loss distance. A higher `atrMultiplier` means your stop-loss will be placed further away from the entry price, reflecting the increased volatility measured by the ATR. 

Essentially, this schema helps you automatically adjust your trade size to account for market volatility, helping to manage risk effectively.


## Interface ISizingParamsKelly

This interface defines how you can tell the backtest framework how to size your trades using the Kelly Criterion. It’s all about specifying parameters for calculating your bet size. 

You're required to provide a `logger` – this is a tool to help you see what's happening behind the scenes as your trades are sized, useful for debugging and understanding the sizing process.

## Interface ISizingParamsFixedPercentage

This interface, `ISizingParamsFixedPercentage`, helps you define how much of your capital to use for each trade when using a fixed percentage sizing strategy. Think of it as a set of rules that dictate your position sizes.

It primarily contains a `logger` property, which allows you to track what's happening internally with your sizing calculations. This logger is incredibly useful for debugging and understanding how your position sizes are being determined.


## Interface ISizingParamsATR

This interface, `ISizingParamsATR`, helps you configure how much of your capital you’re going to use for each trade when using an ATR-based sizing strategy. It's all about controlling your risk.

The main thing you'll provide here is a `logger`. This allows the framework to give you useful messages about what's happening behind the scenes, helping you debug and understand how your sizing parameters are affecting your trades. Think of it as a helpful assistant providing insights into your trading decisions.

## Interface ISizingCallbacks

This section describes the `ISizingCallbacks` interface, which helps you customize how your trading strategies determine the size of trades. It provides a way to respond to key moments in the sizing process. 

Specifically, the `onCalculate` callback is triggered immediately after the framework calculates the trade size. You can use this to inspect the calculated quantity, view the parameters that were used, and ensure the size makes sense for your strategy – perhaps to log it for later review or perform some validation.

## Interface ISizingCalculateParamsKelly

This interface defines the information needed to calculate trade sizes using the Kelly Criterion. It's essentially a way to tell the backtest-kit how to determine how much to bet on each trade based on your historical performance.

You’ll need to provide a `method` specifying that you want to use the Kelly Criterion, along with your `winRate` (the percentage of trades that are winners) and your `winLossRatio` (how much you make on a winning trade compared to how much you lose on a losing one). These values help the framework automatically adjust your bet sizes to optimize for growth.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the information needed to calculate trade sizes using a fixed percentage of your capital. When using this sizing method, you’re essentially committing a set percentage of your total funds to each trade. 

The `method` property is always set to "fixed-percentage" to identify the sizing technique being used. You’re also required to specify a `priceStopLoss` which represents the price level at which a stop-loss order will be placed.

## Interface ISizingCalculateParamsBase

This interface, `ISizingCalculateParamsBase`, provides the fundamental information needed when figuring out how much of an asset to buy or sell. Think of it as the bare minimum data any sizing calculation requires. It includes the trading pair you’re working with, represented by its symbol like "BTCUSDT." You'll also find the current amount of funds available in your account and the anticipated price at which you plan to enter the trade.

## Interface ISizingCalculateParamsATR

This interface describes the settings used when determining trade size using the ATR (Average True Range) method. When you’re using ATR to figure out how much to trade, you're essentially telling the backtest kit to use these parameters. The `method` property confirms that you’re employing the ATR-based sizing, and the `atr` property provides the actual ATR value that will be used in the calculations to decide the trade size.

## Interface ISizing

The `ISizing` interface is a crucial part of how backtest-kit determines how much of an asset your strategy should buy or sell. Think of it as the engine that figures out the size of your trades. 

It has a single, important function called `calculate`. This function takes information about the current market conditions and your risk preferences (provided through `ISizingCalculateParams`) and uses that to return the number of shares or contracts to trade. It's responsible for aligning your trades with your desired risk level.

## Interface ISignalRow

This interface, `ISignalRow`, represents a complete trading signal ready to be used within the backtest-kit framework. Think of it as a single instruction for your trading system to execute. It bundles together all the necessary information – a unique identifier (`id`), the entry price (`priceOpen`), which exchange to use (`exchangeName`), the strategy that generated it (`strategyName`), and timestamps marking its creation and pending status. You’ll find this structure consistently used after signals have been validated and prepared for action. It also includes details about the trading symbol (`symbol`) and a hidden marker (`_isScheduled`) used internally to track scheduled signals.

## Interface ISignalDto

The `ISignalDto` represents the data used to define a trading signal. Think of it as a blueprint for a trade, telling the backtesting system *what* to do and *why*. 

It includes key information like the trade direction (long or short), a human-friendly note explaining the reasoning behind the signal, and the entry price. 

You'll also specify target prices for taking profit and setting a stop-loss to manage risk. Finally, you can estimate how long you expect the trade to last. If you don't provide a unique ID for the signal, the system will generate one automatically.

## Interface IScheduledSignalRow

This interface, `IScheduledSignalRow`, describes a signal that's waiting for the market to reach a specific price before it’s triggered. Think of it as a signal on hold – it’s not active yet because the price hasn't hit the desired level. It builds upon the basic `ISignalRow` to include this delayed activation. 

Once the market price reaches the `priceOpen` value, this scheduled signal transforms into a standard pending signal, ready to be executed. Initially, the `pendingAt` field will reflect the time the signal was scheduled, but will update to the actual pending time once the price triggers the signal. The most important part is the `priceOpen` property which defines at which price the signal becomes active.

## Interface IRiskValidationPayload

This data structure holds information about your portfolio's risk profile, specifically focusing on open positions. It gives you a snapshot of how many active positions you currently have and provides details about each one. Think of it as a report card for your trading, showing you the current state of your open trades across all the strategies you're using. You'll use this information to help assess and manage potential risks in your backtesting environment.

## Interface IRiskValidationFn

This defines a special function that's used to check if your trading strategy's risk settings are safe and reasonable. Think of it as a safety net – it verifies things like maximum position size or leverage to prevent you from accidentally putting yourself at too much risk. If the function finds something amiss, it will signal a problem by throwing an error, stopping the backtest before any actual trades happen. It's a crucial part of ensuring your backtesting process is reliable and prevents potentially disastrous outcomes.

## Interface IRiskValidation

This interface, `IRiskValidation`, helps you define rules for making sure your trading strategies are behaving safely during backtesting. Think of it as a way to add checks and balances to your strategy's risk parameters.

It has two main parts: `validate` and `note`.

The `validate` property holds a function that actually performs the risk validation – it's the code that checks if things look right. The `note` property lets you add a description to explain *why* you're doing that specific validation, which is incredibly helpful for keeping your code understandable and maintainable. This helps anyone reading your code—including yourself later on—understand the reasoning behind the risk checks.

## Interface IRiskSchema

This interface, `IRiskSchema`, helps you define and manage risk controls for your trading portfolio. Think of it as a blueprint for how your system will evaluate potential trades to ensure they align with your risk tolerance. 

You'll use it to register risk profiles, giving each one a unique identifier (the `riskName`). Optionally, you can add a `note` to explain the profile's purpose for other developers.

To fine-tune your risk management, you can include lifecycle event `callbacks` like `onRejected` (when a trade is blocked) or `onAllowed` (when it’s approved). The core of the schema lies in the `validations` array, which holds the actual rules your portfolio will follow to determine if a trade is acceptable. These validations can be simple functions or more complex configurations.


## Interface IRiskParams

The `IRiskParams` interface defines the information you provide when setting up the risk management system within the backtest-kit framework. Think of it as a configuration object.

It primarily focuses on providing a logger, which is essential for tracking what’s happening during your backtesting and identifying any potential issues. This logger allows you to output debug messages and gain insights into the system’s behavior.

## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, provides the necessary information to determine if a new trade should be allowed. Think of it as a safety check performed *before* a trading signal is generated. It bundles together key details like the trading pair's symbol, the name of the strategy making the request, the exchange being used, the current price, and the timestamp. These arguments are essentially passed directly from the client strategy, giving you access to the context needed to make informed decisions about risk management and position sizing.

## Interface IRiskCallbacks

This interface lets you hook into the risk assessment process within the backtest-kit trading framework. Think of it as a way to be notified about what's happening with your risk management. 

You can provide functions to be called when a trading signal is blocked because it exceeds your defined risk limits – that's what `onRejected` is for.  Alternatively, `onAllowed` will let you know when a signal makes it through the risk checks and is considered safe to proceed with. These callbacks give you visibility into why signals are being approved or rejected, enabling you to debug your risk rules or react to certain risk scenarios.

## Interface IRiskActivePosition

This interface represents a position that's currently open and being tracked by the risk management system. It holds key information about the position, such as the signal that triggered it, the name of the strategy responsible, the exchange where it's held, and the exact time it was opened. Think of it as a snapshot of a live trade, useful for analyzing risk across different trading strategies. You’re using this to understand how various strategies are impacting your overall risk exposure.

## Interface IRisk

The `IRisk` interface helps manage and control your trading risks. Think of it as a gatekeeper for your signals, making sure they align with your defined risk boundaries. 

It offers three key functions: 

`checkSignal` lets you verify if a trading signal is permissible given your risk parameters. `addSignal` registers when a new position is opened, letting the system keep track of your exposure.  Finally, `removeSignal` informs the system when a position is closed, updating your risk calculations. This interface is crucial for responsible trading and helps prevent exceeding your risk limits.

## Interface IPositionSizeKellyParams

This interface defines the settings you’re giving to the Kelly Criterion, a method for calculating how much of your capital to risk on each trade. Think of it as providing the framework with information about your trading strategy's past performance. 

Specifically, you'll need to tell the framework your win rate – essentially the proportion of your trades that result in a win.  You'll also need to provide your average win/loss ratio, which reflects how much you win on average compared to how much you lose on each trade. These two numbers help the system determine an appropriate position size for each trade.

## Interface IPositionSizeFixedPercentageParams

The `IPositionSizeFixedPercentageParams` interface helps you define the parameters for a trading strategy that uses a fixed percentage of your capital to size positions. It's particularly useful when you want to control risk by setting a stop-loss price.

The `priceStopLoss` property within this interface specifies the price at which you'll place your stop-loss order, helping to limit potential losses on your trades. This parameter is crucial for managing risk in your backtesting simulations.


## Interface IPositionSizeATRParams

This section describes the parameters used when calculating position size based on the Average True Range (ATR). Specifically, it details the `atr` property, which represents the current ATR value. This value is a key factor in determining how much capital to allocate to a trade, helping to manage risk based on market volatility. Think of it as a measure of how much the price typically moves – a higher ATR suggests larger potential swings.

## Interface IPersistBase

This interface defines the basic operations for saving and retrieving data within the backtest-kit framework. Think of it as the foundation for how your trading strategies interact with persistent storage – like a database or file system.

It provides methods to ensure the storage area is set up correctly at the beginning, and then lets you check if a specific piece of data exists, read it back, or write new data.  The write operation is designed to be reliable, ensuring data isn’t corrupted during the save process. Essentially, this interface provides the core building blocks for managing your backtest data over time.

## Interface IPartialData

This interface, `IPartialData`, is designed to store a small piece of information about a trading signal's progress, specifically for saving and loading that data. It’s like a snapshot of key details that can be saved to a file or database.

The `profitLevels` property holds an array of profit levels that the signal has hit. Think of it as a list of positive milestones.

Similarly, `lossLevels` contains an array of loss levels, marking points where the signal experienced a loss.

Essentially, `IPartialData` lets you keep track of a signal's journey, even when the application needs to be shut down and restarted. It handles the tricky part of converting data structures that can’t be directly saved into a format that can be easily stored and retrieved.


## Interface IPartial

The `IPartial` interface helps track how much profit or loss a trading signal is generating. It's used by the system to keep tabs on milestones like reaching 10%, 20%, or 30% profit or loss.

When a signal is making money, the `profit` method is called to check if any new profit levels have been hit, avoiding duplicate notifications. Similarly, the `loss` method handles tracking and notifying about loss levels.

Finally, when a signal closes, whether by hitting a target profit or loss, or due to time expiration, the `clear` method cleans up the tracking data, removes it from memory, and ensures everything is saved correctly.

## Interface IOptimizerTemplate

This interface acts as a blueprint for creating code snippets and messages used within the backtest-kit trading framework, especially when working with Large Language Models. It provides methods for building different parts of your trading setup.

The `getJsonDumpTemplate` method creates a debugging helper function to easily inspect data.

Several methods like `getTopBanner`, `getUserMessage`, and `getAssistantMessage` help structure the initial setup and conversation flow when interacting with an LLM.  These generate the necessary imports, initialization steps, and message content.

You're also provided with code generation for key components: `getWalkerTemplate` builds the configuration for the Walker, `getExchangeTemplate` creates the exchange setup, `getFrameTemplate` defines the timeframe settings, and `getStrategyTemplate` handles strategy configuration, including integrating with LLMs.

Finally, `getLauncherTemplate` generates the code to launch the Walker and receive updates.  The `getTextTemplate` and `getJsonTemplate` methods create helper functions for the LLM to output text and structured JSON data respectively.

## Interface IOptimizerStrategy

This interface, `IOptimizerStrategy`, holds all the information that goes into creating a trading strategy using an LLM. Think of it as the complete record of how a strategy was born – it includes the trading pair it's designed for (the `symbol`), a unique identifier (`name`) to easily refer to it, and the full conversation history with the LLM (`messages`).  The `messages` array lets you see exactly what questions were asked and what the LLM responded with, providing a transparent view of the strategy's creation.  Finally, the `strategy` property itself contains the actual generated strategy logic, which is the core instructions for how to trade.

## Interface IOptimizerSourceFn

The `IOptimizerSourceFn` is a function that provides the data needed to train and optimize your trading strategies. Think of it as a pipeline feeding data into your backtesting process. It’s designed to handle large datasets efficiently through pagination, meaning it delivers data in chunks rather than all at once. Crucially, the data provided by this function *must* include unique identifiers for each data point, allowing the backtest kit to track and process them correctly. This ensures that your optimizer has a steady flow of data to learn from.

## Interface IOptimizerSource

This interface describes a data source used for backtesting and optimization. Think of it as a way to tell the backtest-kit where to get its data and how to structure that data into a format suitable for use with large language models (LLMs).

You provide a unique name to identify the data source, and an optional description to help understand its purpose. 

The most important part is the `fetch` function, which tells the system how to retrieve the data itself, ensuring it supports pagination to handle large datasets. 

You can also customize how the data is presented as user and assistant messages within an LLM conversation by providing optional formatting functions. If you don't provide these, the system uses built-in defaults.

## Interface IOptimizerSchema

This interface describes the configuration needed to register an optimizer within the backtest-kit framework. Think of it as a blueprint for how your optimizer will work. 

You’ll define a unique name for your optimizer so it can be easily accessed later.  The `rangeTrain` property lets you specify multiple training periods; the optimizer will generate and test different strategy variations for each of these periods to compare their performance. A single `rangeTest` defines the period used to validate the final strategy.

The `source` property is crucial – it lists the data sources that will be used to inform the strategy generation process, essentially feeding information into the LLM.  The `getPrompt` function is responsible for crafting the prompt that gets sent to the LLM, based on the data from your sources and the conversation history. 

You can customize the optimizer's behavior with the `template` property, overriding default settings. Lastly, `callbacks` allow you to hook into different stages of the optimization process for monitoring and debugging purposes.

## Interface IOptimizerRange

This interface helps you define specific time periods for backtesting and optimization. Think of it as setting the boundaries for when your trading strategy will be evaluated. You provide a start date and an end date, marking the beginning and end of the data you want to use. It’s also useful to add a descriptive note, just so you know what that time range represents – perhaps "2023 bear market" or "2024 growth period."

## Interface IOptimizerParams

This interface defines the essential settings used when creating an Optimizer. It bundles together two key components: a logger for tracking what's happening and a complete template that provides all the methods needed for the optimization process. Think of the logger as your debugging tool, while the template contains the logic for running and evaluating different trading strategies. The template combines settings you provide with default configurations to ensure everything works together seamlessly.

## Interface IOptimizerFilterArgs

This interface defines the information needed to request specific data from a data source. Think of it as specifying what data you want—it lets you pinpoint a trading pair, like "BTCUSDT," and a particular time period, starting with a `startDate` and ending with an `endDate`. It’s used behind the scenes to help efficiently grab the right data for backtesting.

## Interface IOptimizerFetchArgs

This interface defines the information needed to request data in batches. Think of it as telling the system how many records you want in each chunk and where to start fetching them. The `limit` property specifies the maximum number of records to retrieve per request, and `offset` tells the system how many records to skip before starting the current batch – useful for navigating through large datasets with pagination. The default for `limit` is 25, but you can adjust it as needed.

## Interface IOptimizerData

This interface, `IOptimizerData`, is the foundation for providing data to backtest optimization processes. Think of it as the standard format for information you're feeding into the system to find the best trading strategies. Every piece of data you provide needs a unique identifier, called `id`, so the system can avoid processing the same data multiple times, especially when dealing with large datasets that might be loaded in chunks. This `id` is crucial for making sure the optimization process runs efficiently and accurately.

## Interface IOptimizerCallbacks

These callbacks give you a way to keep an eye on what's happening during the optimization process. 

`onData` lets you react when the training data for your strategies is ready, allowing you to inspect or log that data. 

`onCode` triggers when the code for your strategies is generated, so you can check it for errors or keep records.

`onDump` is called after the generated strategy code is saved to a file; use this to confirm the save completed or perform follow-up tasks.

Finally, `onSourceData` is triggered whenever data is pulled from a data source. It provides the symbol, source name, data itself, and the date range of that data, giving you insights into the data acquisition process.

## Interface IOptimizer

The IOptimizer interface provides a way to interact with the backtest-kit framework for creating and exporting trading strategies. You can use it to retrieve strategy data for a specific asset, pulling together information from various sources and preparing it for analysis. 

This interface also lets you generate the complete code for a trading strategy, combining all the necessary components into a single, runnable file. Finally, you can save the generated code directly to a file, automatically creating the needed directories if they don’t already exist. This simplifies the process of deploying your strategies.

## Interface IMethodContext

This interface, `IMethodContext`, acts like a little guidebook for your backtesting code. It holds the names of the different components – the exchange, the trading strategy, and the frame – that are being used in a particular operation. Think of it as a way to keep track of which parts of your system are working together. This context is automatically passed around by the system, so you don’t have to manually manage it, ensuring that the correct components are always used. It’s especially helpful for knowing which exchange, strategy, and frame are active, and whether you're running a backtest or live trading.


## Interface ILogger

The `ILogger` interface defines a way for different parts of the backtest-kit framework to record information. Think of it as a central place to leave notes about what's happening. 

You can use the `log` method for general notes about events or changes. The `debug` method is for very detailed information you'd only want to see when you’re actively troubleshooting. `info` is used for reporting successful actions and overall status. Finally, `warn` lets you record things that might be a problem, but aren’t stopping the system from working. These logging methods are used throughout the framework, including components like agents, states, and storage, to help with debugging, monitoring, and keeping track of what's happening.

## Interface IHeatmapStatistics

This interface defines the data you'll receive when generating a heatmap for your portfolio's performance. It bundles together key metrics across all the assets you're tracking. 

You'll find an array detailing the individual statistics for each symbol, allowing you to see how each asset contributed to the overall portfolio. Along with that, it gives you the total number of symbols, the total profit and loss (PNL) for the entire portfolio, the portfolio's Sharpe Ratio (a measure of risk-adjusted return), and the total number of trades executed. Essentially, it's a single object holding a snapshot of your portfolio's health and trading activity.

## Interface IHeatmapRow

This interface describes the performance statistics for a specific trading symbol, like BTCUSDT. It gathers key metrics across all the strategies applied to that symbol during a backtest. 

You'll find information about the total profit or loss, the risk-adjusted return (Sharpe Ratio), and the largest drop in portfolio value (maximum drawdown). It also includes details on the number of trades executed, the number of winning and losing trades, and calculated ratios like win rate and profit factor. 

Furthermore, it provides insights into the average profit/loss per trade, volatility (standard deviation), and streaks of consecutive wins or losses. Finally, you can see the expectancy which gives a sense of the average outcome per trade.

## Interface IFrameSchema

This `IFrameSchema` acts as a blueprint for defining how your backtest will generate data points, essentially setting the timeline and frequency of your trading simulations. Think of it as declaring the scope of your backtest – when it starts, when it ends, and how often it creates data.

Each schema has a unique name for identification and allows for optional notes to help developers understand its purpose. The `interval` property determines the granularity of the data, like every minute, hour, or day.  You also specify the exact start and end dates for your backtesting period. Finally, you can attach optional callback functions to be executed at different stages of the frame's lifecycle, giving you more control over the data generation process.

## Interface IFrameParams

The `IFramesParams` interface defines the information needed to set up a ClientFrame, which is a core part of the backtest-kit framework. Think of it as a configuration object. It includes a `logger` property, which allows you to easily output debugging information during your backtesting process. This logger helps you understand what’s happening behind the scenes and diagnose any issues. It’s an extension of `IFramesSchema`, bringing added logging capabilities to the frame setup.

## Interface IFrameCallbacks

This section describes the `IFrameCallbacks` interface, which lets you react to different stages of the backtest kit's timeframe generation process. Think of it as a way to be notified and potentially influence how your timeframes are created.

Specifically, the `onTimeframe` property is a function that gets triggered once the framework has calculated the array of dates you're going to use for your backtest. You can use this function to check if the dates look right, log them for debugging, or even perform some custom validation steps. The function receives the timeframe array itself, the start and end dates for the timeframe, and the interval used to generate them.

## Interface IFrame

The `IFrames` interface is a core component that handles the creation of timeframes – essentially, the sequences of dates and times your backtest will run on. Think of it as the engine that produces the schedule for your trading simulation. 

The `getTimeframe` method is the key function here. When you call it, you tell it which asset (like a stock ticker) and timeframe you're interested in (e.g., "1 day", "1 hour"). It then returns a promise that resolves to an array of timestamps, spaced out according to how you've configured your backtest. This array tells your backtest exactly when to evaluate trades and record performance.

## Interface IExecutionContext

The `IExecutionContext` interface holds essential information used during trading simulations and live trading. Think of it as a package of data that’s passed around to give your trading strategies and exchanges the context they need. It tells them what trading pair, like BTCUSDT, is being worked with, and what the current time is. Crucially, it also indicates whether the code is running a backtest, essentially a historical simulation, or is executing trades live. This information is automatically provided by the `ExecutionContextService` to functions like those that fetch historical data or handle market ticks.

## Interface IExchangeSchema

This interface helps you define how backtest-kit interacts with different cryptocurrency exchanges. Think of it as a blueprint for connecting to a specific exchange’s data.

It lets you specify a unique name for the exchange so backtest-kit knows which one it's dealing with. You can also add a note for yourself to remember important details about the exchange’s setup.

The core of this interface is `getCandles`, which is the function that tells backtest-kit how to actually retrieve historical price data (candles) from the exchange. You’ll write the code to fetch data from the exchange’s API or database here.

You also have functions, `formatQuantity` and `formatPrice`, which handle the specific rules for how quantities and prices are displayed on different exchanges – ensuring they're formatted correctly.

Finally, you can provide optional callbacks to react to events happening within the exchange connection, like when new candle data arrives.

## Interface IExchangeParams

The `IExchangeParams` interface defines the information needed to set up a connection to an exchange within the backtest-kit framework. It’s essentially a blueprint for configuring how your trading simulation will interact with exchange data.

You'll need to provide a logger to help track what's happening during your backtesting process – useful for debugging and understanding the simulation's behavior.

Also, it includes an execution context, which tells the system things like which symbol you're trading, the specific time period you're simulating, and whether it's a backtest or a live trading scenario. This context is crucial for ensuring your backtest accurately reflects the conditions you're simulating.

## Interface IExchangeCallbacks

This interface defines optional functions you can provide to a trading exchange within backtest-kit. Think of them as event listeners – you tell the framework what to do when certain data arrives. Specifically, `onCandleData` lets you react to newly fetched candlestick data for a particular trading symbol and time interval. This function receives information about the symbol, interval, the starting date and limit of the data, and an array containing the candlestick data itself, allowing you to process it as needed within your backtesting strategy.

## Interface IExchange

The `IExchange` interface defines how backtest-kit interacts with trading venues. It lets you retrieve historical and future price data (candles) for a specific trading pair and timeframe. You can also use it to get the volume-weighted average price (VWAP), calculated from recent trading activity, which is useful for assessing market trends. The interface also provides functions to correctly format order quantities and prices to match the exchange’s requirements, ensuring orders are placed accurately. Essentially, this interface provides the essential tools for accessing market data and preparing orders within the backtesting environment.

## Interface IEntity

This interface, IEntity, serves as the foundation for all data objects that are saved and retrieved from storage within the backtest-kit framework. Think of it as the blueprint for anything you want to persistently store, like trades, orders, or account balances. It ensures that all persisted objects have a consistent structure and can be managed effectively by the system. If you're creating custom data types to be saved, they should implement this interface.

## Interface ICandleData

This interface defines the structure for a single candlestick, which is a fundamental piece of data used in trading and backtesting. Each candlestick represents a specific time interval and contains information about the price and volume activity during that period. It includes the timestamp indicating when the candle began, the opening price, the highest and lowest prices reached, the closing price, and the total volume traded. Think of it as a snapshot of price action over a set time, providing essential data for analyzing trends and evaluating trading strategies.

## Interface DoneContract

This interface represents what happens when a background task finishes, whether it's a backtest or a live trading execution. You're notified through this object when a background process completes. It tells you key details like which exchange was used, the name of the strategy that ran, whether it was a backtest or live trading, and the specific trading symbol involved. Think of it as a notification with important context about the finished process.

## Interface BacktestStatistics

The `BacktestStatistics` interface gives you a detailed breakdown of how your trading strategy performed during a backtest. It compiles a wealth of information, including a list of every closed trade with its specific details. You'll find the total number of trades executed, as well as a count of winning and losing trades.

Key performance indicators are available, such as the win rate (percentage of winning trades), average profit per trade, total profit across all trades, and standard deviation (a measure of volatility).  You can also assess your strategy's risk-adjusted return with the Sharpe Ratio and its annualized version.  The certainty ratio helps understand the ratio of average win to average loss, and expected yearly returns provide an estimate of potential annual profits. All numeric values are carefully handled, and will be marked as unavailable if the calculations weren’t possible due to inconsistencies.
