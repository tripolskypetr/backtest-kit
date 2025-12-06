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

This function lets you plug in your own logging system for the backtest-kit framework. It’s handy if you want to direct log messages to a specific place, like a file, a database, or a custom monitoring tool. When you provide your logger, any log messages generated by the framework will be sent to it, and crucially, these messages will automatically include useful information like the strategy name, exchange being used, and the trading symbol. This makes debugging and understanding what's happening during backtests much easier. You need to provide an object that adheres to the `ILogger` interface.

## Function setConfig

This function lets you customize how backtest-kit operates. Think of it as setting the overall preferences for your backtesting environment. You can adjust certain settings to fine-tune the framework's behavior, overriding the default values. It accepts a configuration object where you specify which settings you want to change; you don't need to define everything at once – just the parts you want to adjust. The function completes an asynchronous operation, so it returns a promise that resolves when the configuration is applied.

## Function listWalkers

This function gives you a look at all the different "walkers" that are set up within the backtest-kit framework. Think of walkers as specialized tools that process data during a backtest. It returns a list describing each walker, including what it does and how it works. This is helpful if you want to understand how your backtest is configured, create tools to manage your walkers, or generate documentation. Essentially, it's a way to see all the pre-configured data processors.

## Function listStrategies

This function gives you a way to see all the trading strategies that backtest-kit knows about. Think of it as a quick inventory of the strategies you're working with. It returns a list of strategy descriptions, allowing you to examine them, build tools to display them, or simply verify that everything is set up correctly. Essentially, it's a way to peek under the hood and understand what strategies are available for backtesting.

## Function listSizings

This function lets you see all the sizing strategies currently set up within the backtest-kit framework. Think of it as a way to get a complete picture of how your trades will be sized. It returns a list of configurations, which you can use to understand your system’s sizing logic or display it in a user interface. It's particularly helpful if you’ve added custom sizing strategies and want to verify they're registered correctly.

## Function listRisks

This function lets you see all the risk assessments your backtest kit is set up to handle. Think of it as a way to peek under the hood and see how your trading strategy is protected against potential problems. It returns a list of these risk configurations, giving you insights into the safeguards in place. You can use this information to check your setup, create documentation, or even build tools to visualize these risk parameters.

## Function listOptimizers

This function lets you see all the optimization strategies currently set up within your backtest kit. It's like getting a directory of available tools for fine-tuning your trading models. You can use this list to understand what options are available, for example, when building a user interface that allows users to select different optimization methods. Essentially, it provides a snapshot of the registered optimizers, making it easy to inspect and understand the available strategies.

## Function listFrames

This function lets you see all the different data frames that your backtest kit is using. It’s like getting a directory listing of your data structures. You can use this to understand what data is available for trading, to build tools that automatically document your setup, or simply to check that everything is set up correctly during development. The function returns a promise that resolves to an array of frame schemas, providing details about each frame.

## Function listExchanges

This function helps you discover all the trading exchanges your backtest-kit setup recognizes. Think of it as a way to see a complete inventory of the platforms you're able to simulate trades on. It returns a list of exchange details, letting you examine what's available for your backtesting environment. This is particularly handy if you want to build tools that adapt to different exchanges or just want to understand which platforms are currently supported.


## Function listenWalkerProgress

This function lets you keep an eye on how a backtest is progressing. It's like setting up a notification system that tells you when each strategy within your backtest has finished running. 

You provide a function, and whenever a strategy completes, that function will be called with information about its progress.

Importantly, even if your function takes a little time to process that information (like making an asynchronous request), the updates will be handled one after another, ensuring things don't get jumbled up. This provides a reliable way to monitor the backtest’s overall completion.


## Function listenWalkerOnce

This function lets you temporarily listen for specific progress updates from a trading simulation. You provide a filter to define what kind of update you're interested in, and then a function to execute when that update happens. After that function runs once, the listener automatically stops, so you don't need to worry about manually unsubscribing. It's perfect for situations where you need to react to a single, specific event within the simulation's process.

The first argument, `filterFn`, specifies the criteria for selecting events. The second, `fn`, is the function that will be called when a matching event is detected. The function returns another function, which you can call to stop the listener manually if needed.

## Function listenWalkerComplete

This function lets you be notified when a backtest run finishes. Think of it as subscribing to an alert that goes off once all your trading strategies have been tested. The notification includes a summary of the results. Importantly, even if your notification process takes some time, the framework ensures that notifications are handled one at a time, keeping things orderly. You provide a function that will be executed when the backtest completes, and this function receives the final results as an argument.

## Function listenWalker

The `listenWalker` function lets you keep an eye on how a backtest is progressing. It's like setting up a notification system that tells you when each trading strategy within the backtest has finished running.  You provide a function that will be called after each strategy completes, and this function receives information about the event.  Importantly, even if your callback function does some asynchronous work, the events are processed one at a time to ensure order and prevent any unexpected conflicts. This gives you a reliable way to monitor the backtest’s flow and react to each strategy’s results as they become available.


## Function listenValidation

This function allows you to keep an eye on potential issues during your trading strategy's risk validation checks. It's like setting up an alert system that notifies you whenever a validation process encounters an error. Whenever a risk validation function runs into a problem, this function will trigger a callback that you provide, giving you a chance to debug or log the error. Importantly, these notifications happen in the order they occur, and the callback is handled carefully to avoid any conflicts if it involves asynchronous operations. You essentially subscribe to these validation errors to ensure your strategy remains safe and reliable.


## Function listenSignalOnce

This function allows you to temporarily listen for specific trading signals. You provide a filter that defines which signals you’re interested in, and a function that gets executed only once when a matching signal arrives. After that single execution, the listener automatically stops, making it perfect for situations where you need to react to a signal just once and then move on. Think of it as setting up a temporary alert for a particular market condition.

It takes two parts: a filter that checks each incoming signal to see if it’s what you’re looking for, and a function to run when that specific signal appears. Once the signal matches your filter and the function runs, the listening stops automatically.

## Function listenSignalLiveOnce

This function lets you quickly react to specific trading signals coming from a live backtest run. You tell it what kind of signal you're interested in using a filter – essentially, a rule to identify the signals you want to see. Then, you provide a function that will be executed *only once* when a matching signal arrives. After that single execution, the function automatically stops listening, so you don't have to worry about manually unsubscribing. It's perfect for one-off tasks or reacting to a particular event during a live backtest. 

The filter function determines which signals are passed on to your callback. Your callback then receives the specific signal data to work with.

## Function listenSignalLive

This function lets you listen for real-time trading signals coming from a live backtest run. Think of it as setting up a listener that gets notified whenever a new signal is generated.

It's specifically designed to work with `Live.run()` and provides a way to handle these signals as they arrive. The signals are processed one at a time, ensuring they’re handled in the order they were created.

To use it, you provide a function (`fn`) that will be called with the signal data each time a new signal is available. The function you provide will also return a function that you can call to unsubscribe from the signal.

## Function listenSignalBacktestOnce

This function lets you set up a listener that only reacts to specific backtest signals – it’s like creating a temporary alert for your backtesting. You provide a filter to decide which signals you're interested in, and then a function that will run only once when a matching signal comes through during a backtest run. Once that single event is processed, the listener automatically disappears, keeping things clean and avoiding unwanted continuous processing. It's perfect for debugging or quickly inspecting a particular event during your backtesting experiments.


## Function listenSignalBacktest

This function lets you hook into the backtest process and get notified whenever a signal is generated. Think of it as setting up a listener for updates during a backtest run. It's specifically designed for events coming from `Backtest.run()`.  The signals are delivered to your callback function one at a time, ensuring they’re processed in the order they happened. You provide a function that will be called with each signal event, and this function returns another function that you can use to unsubscribe from these updates later.

## Function listenSignal

This function lets you set up a listener that gets notified whenever your trading strategy emits a signal – like when it's idle, a trade is opened, a trade is active, or a trade is closed. Importantly, the signals are handled one at a time, even if your callback function takes some time to complete. This ensures that things happen in the order they're received and prevents your callback from running into unexpected issues caused by multiple processes happening simultaneously. You just provide a function that will be called with the signal details, and the framework takes care of the rest. The function itself returns another function that you can use to unsubscribe from the signal events later.

## Function listenPerformance

This function lets you monitor how your trading strategies are performing in terms of timing. It's like setting up a listener that gets notified whenever a performance metric changes during the backtesting process. You provide a function that will be called with these performance events, allowing you to track things like how long different operations take.  The key is that these events are handled one after another, even if your callback function needs to do some asynchronous work. This ensures you get a clear picture of the order in which things happen and prevents any unexpected issues from concurrent execution. It’s a handy tool for identifying areas where your strategy might be slow or inefficient.


## Function listenPartialProfitOnce

This function lets you set up a temporary alert for specific partial profit events. Think of it as a one-time listener – it watches for events that meet your criteria, executes a function once when they occur, and then quietly stops listening. It’s great when you need to react to a particular profit level just once and then move on.

You provide a filter to specify exactly which events you're interested in, and a function that will be executed when a matching event happens. The function returns another function that you can use to stop the listening if needed.

## Function listenPartialProfit

This function lets you keep track of your trading progress by getting notified when your profits hit certain milestones, like 10%, 20%, or 30% gains. It's designed to handle these notifications in a reliable order, even if the code you provide to process each notification takes some time to run. Essentially, you give it a function that will be called whenever a profit milestone is reached, and it makes sure those calls happen one after another, in the order they occur. You're providing the code to be executed when a partial profit event triggers, and it manages the execution sequence for you.


## Function listenPartialLossOnce

This function lets you set up a listener that reacts to partial loss events, but only once. You provide a filter to specify exactly what kind of loss event you're looking for, and then a function that will be executed when that specific event occurs. After the function runs once, the listener automatically stops, which is handy when you need to respond to a condition and then move on. Think of it as a temporary alert for a particular loss situation. The filter tells it *what* to listen for, and the function tells it *what to do* when it finds it.

## Function listenPartialLoss

This function lets you keep track of when your trading strategy hits certain loss levels, like losing 10%, 20%, or 30% of its initial value. It's a way to get notified about significant drops in performance. The notifications are handled in a specific order, ensuring that events are processed one at a time, even if your notification handling code takes some time.  You provide a function that gets called whenever a partial loss level is reached, and this function will be executed sequentially.

## Function listenOptimizerProgress

This function lets you keep an eye on how your optimizer is doing while it's running. It sends updates as the optimizer processes data, ensuring you get a progress report. These updates are delivered one at a time, even if your tracking function takes some time to process each one, preventing any slowdowns. You provide a function that will be called with each progress event, and this function returns another function that you can use to unsubscribe from these updates later.

## Function listenExit

This function lets you be notified when something goes seriously wrong and halts the backtest or other background processes. Think of it as a safety net for critical failures.  Unlike catching minor hiccups, this catches errors that bring everything to a stop, like issues preventing the program from continuing. When a fatal error occurs, the provided function will be called, ensuring errors are handled one at a time, even if your error handling involves asynchronous operations. To unsubscribe from these fatal error notifications, the function returns another function you can call when you no longer need to listen. You provide a function (`fn`) that will be executed when a fatal error occurs.

## Function listenError

This function lets you be notified whenever a recoverable error happens while your trading strategy is running. Think of it as a safety net – if something goes wrong, like a failed API request, you'll get a signal.

It's designed to keep your strategy running smoothly even when these errors occur, and it makes sure those error notifications are processed one at a time in the order they happen, even if your error handling code needs to do something asynchronous. 

You provide a function that will be called with details about the error, and this function returns another function that you can use to unsubscribe from these error notifications later.

## Function listenDoneWalkerOnce

This function lets you listen for when a background task within your backtest finishes, but only once. It's perfect for situations where you need to react to a single completion event and then stop listening.

You provide a filter function that determines which completion events you’re interested in.  Then, you give it a callback function that will be executed when a matching event occurs. Once the callback runs, the listener automatically stops, preventing it from triggering again. Think of it as setting up a temporary alert that goes off just for one specific completion.


## Function listenDoneWalker

This function lets you be notified when a background task within the backtest-kit framework finishes processing. Think of it as setting up a listener for when a task is done. 

It’s especially helpful when you need to react to the completion of tasks that might involve asynchronous operations. The system guarantees that your notification code will run one after another, in the order the tasks complete, even if your code itself performs some asynchronous work.  You provide a function that will be called when a background task is finished, and the system takes care of managing the timing and order of execution.

## Function listenDoneLiveOnce

This function lets you react to when a background task finishes running within the backtest-kit framework, but in a special way – it only responds once. You provide a filter to specify which completed tasks you're interested in, and then a function that will be executed just once when a matching task finishes. After that single execution, the subscription automatically stops, so you don't have to worry about cleaning it up yourself. It's a convenient way to handle a specific completion event without ongoing subscriptions.




The function returns a function that you can call to unsubscribe from the event if needed, although the automatic unsubscribe makes it often unnecessary.

## Function listenDoneLive

This function lets you monitor when background tasks within your backtest are finished. It's designed to work with `Live.background()`, notifying you when those tasks are done. The important thing is that these notifications are handled one at a time, even if the function you provide takes some time to execute – this ensures things don't get messy with overlapping processes. You give it a function to run when a background task finishes, and it returns a function you can use to unsubscribe from those notifications later.

## Function listenDoneBacktestOnce

This function lets you be notified when a background backtest finishes, but in a special way: you can specify a condition that must be met for the notification to occur, and it only triggers *once*. Think of it as setting up a single, specific alert for a backtest completion. 

You provide a function (`filterFn`) that checks the backtest results; only if this condition is true will your callback function (`fn`) be executed. 

Once your callback has run, the subscription is automatically removed, ensuring you don't receive any further notifications for that particular backtest. This is perfect for situations where you need to react to a specific outcome of a background test without continuous monitoring.


## Function listenDoneBacktest

This function lets you be notified when a background backtest finishes running. Think of it as setting up a listener for when your automated trading strategy's simulation is complete. The notification happens even if the backtest is running in the background. Importantly, the order of notifications is maintained, and any asynchronous operations within your notification code will be handled properly to prevent any conflicts. To use it, you provide a function that will be called when the backtest finishes, and it returns a way to unsubscribe from these notifications later.

## Function listenBacktestProgress

This function lets you keep an eye on how a backtest is running. It provides updates as the backtest proceeds, especially useful when you're doing things in the background. The updates are delivered one at a time, ensuring that any actions you take based on these updates happen in the order they are received, even if your response involves some asynchronous work. You provide a function that will be called with each progress update, and this function will then handle displaying information or taking action based on the backtest's current state. The function returns another function that you can use to unsubscribe from these updates.

## Function getMode

This function tells you whether the trading framework is currently running a backtest or live trading. It returns a promise that resolves to either "backtest" or "live", letting you know the context of the current execution. Use this to adapt your strategies or logging based on the mode you're in.

## Function getDate

This function, `getDate`, simply retrieves the current date. When you're running a backtest, it provides the date associated with the timeframe you're analyzing. If you're running the framework in a live trading environment, it gives you the actual current date and time. It's a handy way to know what date is relevant to your calculations or trading decisions.

## Function getCandles

This function lets you retrieve historical price data, also known as candles, for a specific trading pair. Think of it as asking for a record of how the price moved over time. 

You tell it which trading pair you're interested in, like "BTCUSDT" for Bitcoin against USDT, and how frequently you want the data – for example, every minute, every 3 minutes, or every hour. You also specify how many candles (price records) you want to pull. 

The function then fetches this data from the exchange you're using, retrieving it from the past. It's a fundamental tool for analyzing past performance and building trading strategies.


## Function getAveragePrice

This function, `getAveragePrice`, helps you figure out the average price of a trading pair, like BTCUSDT. It does this by looking at the last few minutes of trading activity and calculating a Volume Weighted Average Price, or VWAP. Essentially, it gives more weight to prices where more trading happened. If there's no trading volume to consider, it simply calculates the average closing price instead. You just need to provide the symbol of the trading pair you're interested in to get the average price.

## Function formatQuantity

This function helps you ensure that the quantity you're using for trading is formatted correctly, following the specific rules of the exchange you're using. It takes the trading pair symbol, like "BTCUSDT", and the raw quantity value as input. The function then uses the exchange’s rules to determine the correct number of decimal places for that quantity, returning a formatted string. This is crucial for making sure your orders are valid and processed correctly on the exchange.

## Function formatPrice

This function helps you display prices correctly for different trading pairs. It takes the trading symbol, like "BTCUSDT", and the raw price value as input. Then, it automatically adjusts the number of decimal places to match how the specific exchange formats prices. This ensures your displayed prices look consistent and accurate, following the conventions of the underlying exchange.

## Function addWalker

This function lets you register a "walker" to help compare how different trading strategies perform against each other. Think of a walker as a way to run backtests for several strategies simultaneously, using the exact same historical data. It then analyzes the results and provides a comparison based on a metric you define in the walker's configuration. You pass in a schema that describes how the walker should execute these backtests and perform the comparisons.

## Function addStrategy

This function lets you tell backtest-kit about a new trading strategy you've created. Think of it as registering your strategy so the framework knows how to use it during backtesting or live trading. When you add a strategy, the framework performs checks to make sure it’s working correctly – verifying things like signal data and ensuring signals aren't sent too frequently.  If you're running in live mode, your strategy's information will be safely stored even if there are unexpected issues.

You’ll provide a configuration object, known as `strategySchema`, which contains all the details about your strategy.

## Function addSizing

This function lets you tell the backtest-kit how to determine the size of your trades. Think of it as setting up your risk management rules. You provide a configuration object that outlines your preferred sizing method – whether you want to use a fixed percentage of your capital, a Kelly criterion approach, or something based on Average True Range (ATR).

The configuration lets you specify all the details, like the percentage of risk you're comfortable with, multipliers for Kelly or ATR calculations, and even limits on the minimum or maximum position size you'll take.

You can also provide a callback function to be notified when the framework calculates your position size, which is useful for debugging or custom logic. Essentially, this function is crucial for defining how much capital gets allocated to each trade based on your strategy's risk profile.

## Function addRisk

This function lets you set up how your trading framework manages risk. Think of it as defining the boundaries for how much your strategies can trade at once and putting in place custom checks to ensure your portfolio stays healthy. 

You can specify limits on the number of open positions across all your strategies, and even create your own rules for more sophisticated risk management, like monitoring portfolio metrics or checking correlations between assets. 

Importantly, all your trading strategies share the same risk configuration, allowing for a coordinated view of your overall risk exposure. The system keeps track of all active positions, and you can access this information within your custom risk validation functions.

## Function addOptimizer

This function lets you tell backtest-kit about a new way to generate trading strategies. Think of it as registering a recipe for creating automated trading systems. It’s how you define how data is gathered, how an LLM interacts with that data, and ultimately, how a complete, runnable trading strategy gets built. 

The optimizer takes a configuration object that outlines the process – essentially a blueprint for how to pull data, craft prompts for the LLM, and stitch together a fully functional backtest script.  This script will include all the necessary pieces, like exchange settings, trading logic, and even how to track progress.

## Function addFrame

This function lets you tell backtest-kit how to generate the timeframes it will use for testing. Think of it as defining the schedule for your backtest – when it starts, when it ends, and how frequently data will be pulled. You provide a configuration object that specifies the start and end dates of your backtest, the interval (like daily, weekly, or hourly), and a function to handle events related to timeframe generation. By registering these timeframes, you’re essentially setting up the backbone of your backtesting simulation.

## Function addExchange

This function lets you connect your backtest-kit framework to a new data source, essentially telling it where to get historical price information and other crucial exchange details. Think of it as adding a new stock exchange or crypto platform to your testing environment. You provide a configuration object – the `exchangeSchema` – which describes how to access the exchange's data, how to format prices and quantities, and how to calculate indicators like VWAP. By adding an exchange, the framework knows how to fetch data and perform calculations specific to that exchange.

# backtest-kit classes

## Class WalkerValidationService

The WalkerValidationService helps ensure your trading strategies, or "walkers," are correctly configured. 

Think of it as a registry and checker for your walker definitions. You use it to register the blueprints for each walker, telling it what data each walker expects. 

The `addWalker` method lets you register a new walker schema, basically telling the service about a new strategy and its requirements.  Then, `validate` checks if a walker exists and is set up properly, flagging any issues before your strategy runs. Finally, `list` gives you a quick overview of all the walkers currently registered within the service, helping you keep track of your strategies.

## Class WalkerUtils

WalkerUtils is a handy tool that simplifies running and managing walker comparisons, which are used to evaluate trading strategies. It acts as a central point for interacting with the walker comparison process.

You can use `run` to execute a walker comparison for a specific trading symbol, automatically figuring out the relevant exchange and frame names. This method gives you access to the comparison data as it's processed. 

If you just want to trigger a walker comparison without needing the results – perhaps for logging or other side effects – `background` is a convenient option.

Need to retrieve the final results from a walker comparison? `getData` fetches that information for you. 

Want a nicely formatted report detailing the walker's performance? `getReport` generates a Markdown report. 

Finally, `dump` allows you to save that report directly to a file on your system. This utility is designed to be easily accessible and used throughout your backtesting process.

## Class WalkerSchemaService

The WalkerSchemaService helps you keep track of your trading strategy configurations, ensuring they're consistent and well-defined. It acts as a central place to store and manage these configurations, which we call "walker schemas."

Think of it as a library where you can register your strategy blueprints. The `addWalker()` method (through the `register` property) lets you add new blueprints, and `get()` lets you retrieve them later by name.

Before a new blueprint is added, `validateShallow()` checks it to make sure it has all the essential pieces in place.  If you need to update an existing blueprint with just a few changes, `override()` allows you to do so without rewriting the whole thing.  The service uses a special system (`ToolRegistry` from functools-kit) to make sure the blueprints are stored in a way that prevents errors due to mismatched data types.

## Class WalkerMarkdownService

The WalkerMarkdownService helps you automatically create and save detailed reports about your trading strategies. It listens for updates from your trading simulations (walkers) and organizes the results. Each walker gets its own dedicated space to store data. 

The service then compiles this data into nicely formatted markdown tables that compare the performance of different strategies. These reports are saved as `.md` files in a logs directory, making it easy to track and analyze your backtesting results.

You can clear the accumulated data if you need to start fresh, either for a specific walker or for all of them. The service is designed to automatically initialize itself when you first use it, so you don't have to worry about setting it up manually.

## Class WalkerLogicPublicService

The WalkerLogicPublicService acts as a central point for running and managing backtesting processes. It simplifies running comparisons by automatically passing important details like the strategy name, exchange, and frame alongside your requests.

Think of it as a helper that takes care of the behind-the-scenes context management, allowing you to focus on specifying the symbol you want to analyze. 

It leverages a private service for the actual backtesting logic and a schema service for defining the structure of the backtest. The `run` method is your main entry point for kicking off a backtest, taking a symbol and context information as input and returning a series of results.

## Class WalkerLogicPrivateService

This service helps you compare different trading strategies against each other. Think of it as a conductor orchestrating a series of backtests, giving you updates as each one finishes.

It runs each strategy one after another, using the `BacktestLogicPublicService` under the hood to actually perform the backtesting. As each strategy completes, you'll get progress notifications with the `WalkerContract` data. The service also keeps track of the best performing strategy throughout the process, letting you see how the results are evolving. Finally, it compiles all the results and presents them ranked, so you can easily see which strategies performed best.

You give it the trading symbol, a list of strategies to compare, the metric you’re optimizing for, and some contextual information like the exchange and frame name. It’s designed to help you systematically evaluate and compare different trading approaches.

## Class WalkerCommandService

The WalkerCommandService acts as a central point for interacting with walker functionality within the backtest-kit. Think of it as a convenient wrapper that makes it easier to manage different components involved in running and validating your trading strategies.

It handles things like logging, accessing walker logic, validating your strategies and exchanges, and even schema management.

The main function, `run`, lets you execute a walker comparison for a specific trading symbol. You provide the symbol and some context – like the names of the walker, exchange, and frame you're using – and it returns a stream of results. This makes it straightforward to compare different walker configurations and assess their performance.


## Class StrategyValidationService

The StrategyValidationService helps ensure your trading strategies are set up correctly before you start backtesting. It acts as a central place to register and check the structure of your strategies.

You can add strategy definitions, essentially blueprints, to this service, describing what each strategy looks like.  Then, when you’re ready to run a backtest, you can use the service to verify that the strategy you're using exists and is properly defined. 

The service also keeps track of all the strategy definitions you've added, so you can easily see what's registered. It allows for a more organized and reliable backtesting process by making sure your strategies are structurally sound before they’re put to the test.

## Class StrategySchemaService

This service acts as a central place to store and manage the blueprints, or schemas, for your trading strategies. It uses a type-safe system to keep track of these schemas, making sure they're consistent and well-defined. 

You can register new strategy schemas using the `addStrategy()` method, and then retrieve them later by their name to use in your backtesting. The service also includes validation to catch common errors early on when you're defining your strategies.

If you need to update an existing strategy schema, you can use the `override` method to make partial changes without replacing the entire schema. Essentially, it's a way to keep your strategy definitions organized and reliable.

## Class StrategyGlobalService

This service acts as a central hub for managing and running trading strategies, providing a streamlined way to interact with them. It combines several services to ensure strategies have the necessary information about the market conditions and backtest parameters.

It handles tasks like validating strategy setups, retrieving pending signals (like take profit and stop-loss orders), and executing strategies against historical or live data. You can think of it as the engine that drives the backtesting and live trading processes.

The `validate` function checks that your strategy and its related settings are configured correctly, preventing errors before they happen. The `getPendingSignal` function allows you to track the status of active signals.  The `tick`, `backtest` methods process data and generate trading signals, while `stop` and `clear` allow you to pause or reset a strategy.

## Class StrategyConnectionService

The StrategyConnectionService acts as a central hub for managing and executing trading strategies. It intelligently routes requests to the correct strategy implementation, ensuring that the right strategy handles data for a specific symbol. To improve efficiency, it keeps a record of frequently used strategies to avoid creating new ones repeatedly.

This service manages the lifecycle of strategies, waiting for them to be fully initialized before processing data, whether it's live market ticks or historical backtesting data.  It offers methods to retrieve signals, execute backtests with historical data, and even stop a strategy from generating further signals.  You can also clear out a strategy from its memory, which forces it to reload and reset.

## Class SizingValidationService

The SizingValidationService helps you ensure your trading strategies are using valid sizing methods. Think of it as a central place to define and check how much capital your strategy will use for each trade.

You can add different sizing schemes, each with its own rules and parameters, using the `addSizing` method.  Then, when you want to use a sizing method, you can validate it using the `validate` method, optionally specifying the method being used. This confirms the sizing exists and is configured correctly. 

If you need to see all the sizing schemes you've added, the `list` method provides a convenient way to retrieve them. The `loggerService` property allows you to integrate logging for debugging and monitoring. The internal `_sizingMap` stores the sizing schemas.

## Class SizingSchemaService

The SizingSchemaService helps you organize and manage your sizing schemas in a type-safe way. Think of it as a central place to store and access different sizing rules for your trading strategies. 

It uses a registry to keep track of these schemas, allowing you to easily add new ones, update existing ones, and retrieve them by name. Before a sizing schema is stored, it performs a quick check to make sure it has the necessary elements. This service relies on a logger to keep you informed of any issues that arise. 

You can add sizing schemas using the `register` method, update existing ones with `override`, and get a specific schema using `get`.

## Class SizingGlobalService

This service helps determine how much of an asset to trade based on your risk tolerance and other factors. It sits between the core trading logic and the connection to the sizing data. 

Think of it as a central point for calculating position sizes, handling the complexities behind the scenes so your trading strategy doesn't have to. It uses a connection service to get the necessary information and a validation service to make sure the calculations are sound. 

You'll find it used internally within the backtest-kit, and it also provides an API for more advanced users who want more control over sizing calculations. The `calculate` method is the primary way to interact with this service – you provide the parameters and context, and it returns the calculated position size.

## Class SizingConnectionService

The SizingConnectionService helps manage how position sizes are calculated within the backtest kit. It acts as a dispatcher, directing sizing requests to the correct sizing method based on a name you provide. 

Think of it as a central hub that makes sure the right sizing logic gets applied. It also keeps track of those sizing methods so it doesn’t have to recreate them every time you need them – this speeds things up.

The service uses a `sizingName` to identify which sizing method to use, and it will create the sizing object the first time you request it, then reuse it for efficiency. 

You can use it to calculate position sizes based on factors like risk parameters and the specific sizing technique you’re using, with options like fixed percentages or Kelly criterion available.

## Class ScheduleUtils

The `ScheduleUtils` class is a helpful tool for keeping track of and understanding scheduled trading signals. Think of it as a central place to monitor how signals are being processed and reported for your strategies.

It provides a simple way to access information about signals that are waiting to be executed, signals that have been cancelled, and to calculate metrics like cancellation rates and average wait times. 

You can request detailed statistics for a specific trading symbol and strategy, or generate a nicely formatted markdown report summarizing all scheduled events. Finally, you can easily save these reports to a file for later review. It's designed to be used everywhere, acting as a single, easily accessible tool.

## Class ScheduleMarkdownService

This service helps you track and report on your scheduled trading signals. It keeps an eye on when signals are scheduled and when they's cancelled, organizing them by strategy and the underlying symbol.

It creates detailed markdown reports summarizing these events, including helpful statistics like cancellation rates and average wait times. These reports are saved automatically to files in the `logs/schedule/` directory, with each strategy getting its own report.

The service automatically handles the process of gathering data and generating reports, but you can also manually request data or trigger report generation if needed. You can also clear the accumulated data if you want to start fresh or if you are debugging. It sets itself up to monitor signals as soon as you start using it, so no initial configuration is required.

## Class RiskValidationService

The RiskValidationService helps ensure your trading strategies adhere to predefined risk limits. Think of it as a gatekeeper that verifies your trading decisions align with established rules. 

You can add custom risk profiles to the service using `addRisk`, defining what constitutes acceptable risk for a particular situation. To check if a risk profile exists and is valid, use the `validate` function.

If you need to see all the risk profiles you've set up, the `list` function provides a convenient way to retrieve them. The service uses a logger to keep track of validation activity and potential issues.

## Class RiskSchemaService

This service helps you keep track of your risk schemas in a structured and type-safe way. It acts like a central repository where you can store and manage these schemas.

You can add new risk profiles using the `addRisk()` function (which internally uses `register`), and retrieve them later by their name using `get()`. If you need to update an existing risk profile, `override()` lets you make partial changes.

Before a new risk schema is added, `validateShallow()` checks if it has all the necessary parts and if they are of the right type, ensuring consistency in your risk profiles. The service uses a logger to keep you informed about what's happening.

## Class RiskGlobalService

This service handles risk management operations, acting as a central point for validating risk limits and communicating with the underlying risk connection service. It’s designed to be used both internally within the backtest kit and by the public API.

The service keeps track of opened and closed signals, informing the risk management system about trading activity.  You can register new signals using `addSignal` and remove them when closed with `removeSignal`.

Risk validations are performed with `validate`, and these are cached to prevent unnecessary repeated checks.  You have the option to clear all risk data with `clear`, or clear data associated with a particular risk name for more targeted cleanup. It uses a logger to record validation actions.

## Class RiskConnectionService

The RiskConnectionService acts as a central hub for managing risk checks during trading. It directs risk-related operations to the specific risk implementation that’s configured for a particular strategy. 

Think of it like a dispatcher – you tell it which risk to apply ("riskName"), and it handles the details of getting the right risk manager involved. To make things efficient, it remembers (caches) previously used risk managers, so you don't have to recreate them every time.

You can use it to check if a trading signal is safe to execute, register new signals for tracking, or remove signals when they close out.  There's also a way to clear the cache if you need to force it to recreate a risk manager. If a strategy doesn't have custom risk settings, the "riskName" will be an empty string.

## Class PositionSizeUtils

This class offers helpful tools for determining how much of your capital to allocate to a trade, a critical part of any trading strategy. It provides pre-built functions for common position sizing techniques.

You'll find methods for calculating size using a fixed percentage of your account, the Kelly Criterion (which aims to maximize growth), and an ATR-based approach that considers market volatility. Each of these functions takes relevant data like your account balance, entry price, and stop-loss level as inputs.

The class is designed to make these calculations straightforward, and it even includes checks to ensure the input data aligns with the chosen sizing method, helping to prevent errors. You don't need to create an instance of the class to use these tools; they're available as static methods.

## Class PersistSignalUtils

The PersistSignalUtils class helps manage and store signal data, particularly for trading strategies. Think of it as a reliable keeper of your strategy’s memory. It automatically handles storing and retrieving signal data for each strategy, ensuring your strategy can pick up where it left off, even if things get interrupted.

This class offers a smart system that uses memoization to efficiently manage storage instances. You can also plug in your own custom storage mechanisms if the default isn't quite what you need. 

Importantly, it handles writing data safely – using atomic writes to prevent data loss if the system crashes during a write operation. This ensures that your signal data remains consistent and reliable. The `readSignalData` function retrieves previously saved signals, while `writeSignalData` is used to update the data.

## Class PersistScheduleUtils

This utility class helps manage how scheduled signals are saved and restored for your trading strategies. It ensures that even if your system crashes, your scheduled signals aren't lost. 

Each strategy gets its own separate storage area, and you can even create your own custom way of saving this information. The `readScheduleData` method retrieves previously saved signal data, while `writeScheduleData` saves new or updated signal data to disk safely, using techniques to prevent data corruption. Finally, `usePersistScheduleAdapter` lets you plug in alternative storage methods if the default isn’t what you need.

## Class PersistRiskUtils

This class helps manage how your trading positions are saved and restored, particularly when dealing with risk profiles. Think of it as a safe keeper for your active trading data.

It automatically handles storing and retrieving position information for each risk profile, and lets you customize how that storage happens if you need something beyond the defaults. 

The `readPositionData` method is used to retrieve existing trading positions when your system starts up, and `writePositionData` safely saves your positions when they change. This is especially important to prevent data loss in case of unexpected system issues.

You can even swap out the default storage mechanism by registering your own custom adapter, giving you greater control over the persistence process.

## Class PersistPartialUtils

This class, PersistPartialUtils, helps manage and save partial profit and loss information for your trading strategies. It's designed to be reliable, even if your system crashes unexpectedly.

Think of it as a safe place to store snapshots of your progress, specifically the partial profit/loss levels, for each trading symbol. It remembers this data so you can pick up where you left off.

It allows you to customize how this data is stored, using different storage methods through adapters. When your system needs to load this information, it retrieves it safely, and when changes are made, it saves them in a way that protects against data corruption. You’ll find it working behind the scenes with ClientPartial to keep your trading state consistent. 

You can even register your own custom storage solutions if the built-in methods aren't what you need.






## Class PerformanceMarkdownService

This service helps you understand how your trading strategies are performing. It gathers data about your strategies as they run, keeping track of key metrics like average return, maximum drawdown, and other important statistics.

You can use this service to generate reports in markdown format that provide insights into your strategy's performance, including identifying potential bottlenecks. The reports are saved to your logs folder, making it easy to review your strategy's history.

The service organizes data separately for each symbol and strategy combination, preventing interference between different setups. It also includes a way to completely clear all collected performance data when needed. The initialization process is handled automatically and only runs once.

## Class Performance

The Performance class is your tool for understanding how well your trading strategies are performing. It provides easy ways to gather statistics about your strategies, like how long different parts of the trading process take. 

You can request specific performance data for a given symbol and strategy, receiving a detailed breakdown of metrics grouped by operation type, allowing you to spot potential issues. It also helps you generate clear, readable reports in Markdown format, showing time distribution, detailed metrics, and percentile analysis to help identify bottlenecks. Finally, you can easily save these reports to disk for later review and sharing, with a default location that’s convenient but customizable.

## Class PartialUtils

This class helps you analyze your partial profit and loss data, like when a trade is partially closed. It acts as a central point to gather and present information collected from partial profit and loss events.

You can use it to get overall statistics, such as the total number of profit and loss events. It can also create readable reports formatted as Markdown tables, showing details of each partial event including when it occurred, the symbol involved, and how much profit or loss was realized.

Finally, you can easily export these reports to files, creating Markdown documents that you can share or store for later review. The reports will automatically be saved with a filename based on the trading symbol, like "BTCUSDT.md".

## Class PartialMarkdownService

The PartialMarkdownService helps you keep track of your partial profits and losses and create readable reports. It listens for events related to these partial gains and losses, organizing them for each trading symbol.

Think of it as a tool that automatically gathers your partial profit/loss information and formats it into nicely structured markdown tables. You can generate comprehensive reports for each symbol, complete with overall statistics like total profit/loss events. The service can even save these reports directly to your hard drive.

It’s designed to be easy to set up; it automatically subscribes to the necessary event streams on startup, so you don't have to worry about manual configuration. You can also clear the accumulated data whenever you need to, either for a specific symbol or all of them. The service utilizes isolated storage for each symbol, preventing data from getting mixed up.

## Class PartialGlobalService

This service acts as a central hub for tracking partial profits and losses within the trading system. It's designed to be injected into the core trading strategy, streamlining how profits and losses are managed and providing a single point for logging. 

Think of it as a middleman; when a profit, loss, or clearing event happens, this service first records it globally and then passes the instruction on to a lower-level service that actually handles the connection details. It’s a way to keep your trading strategy cleaner and make it easier to monitor what’s happening with partial profits and losses.

Here’s a breakdown of what it does:

*   **Logging:** It ensures all partial profit/loss actions are logged at a global level, giving you a clear audit trail.
*   **Profit Tracking:** The `profit` function handles cases where a profit level is reached.
*   **Loss Tracking:** The `loss` function handles situations where a loss level is reached.
*   **Clearance:** The `clear` function resets the partial profit/loss state when a trading signal closes out.

The `loggerService` and `partialConnectionService` properties are provided by the system and handle the logging and actual connection management, respectively.

## Class PartialConnectionService

The PartialConnectionService is designed to keep track of partial profits and losses for each trading signal. It acts like a central hub, creating and managing individual tracking objects called ClientPartial for each signal. 

Think of it as a factory that ensures each signal has its own dedicated place to record its progress. The service remembers these "ClientPartial" objects, so it doesn't have to recreate them every time you need to check on a signal's status – this improves efficiency.

It handles crucial actions like recording profit or loss, and closing out positions. When a signal is finished, the service cleans up its associated data, making sure everything is handled neatly and efficiently. The service gets its logging and event handling setup from outside, making it adaptable to different environments. It works together with the broader trading system, integrating seamlessly into the overall workflow.

## Class OptimizerValidationService

The OptimizerValidationService helps keep track of all the optimizers your backtesting system uses, ensuring they're properly defined and available. Think of it as a central directory for optimizers.

It lets you register new optimizers, preventing you from accidentally using the same name for different ones. 

The service also provides a quick way to check if an optimizer is registered and memorizes these checks so that repeated validations don’t slow things down. 

If you need to see a full list of all the optimizers currently registered, you can easily retrieve that information.

## Class OptimizerUtils

This class provides helpful tools for working with your trading strategies, particularly when you’re using an optimizer. It lets you retrieve information about your strategies, generate the actual code that will run them, and even save that code directly to files.

You can use `getData` to gather information about your strategies, like their performance and settings.  `getCode` is where the magic happens – it assembles all the necessary pieces to create a fully functional trading strategy code file ready to be executed. Finally, `dump` allows you to save the generated code to a file in a standard format, conveniently creating any necessary folders along the way.

## Class OptimizerTemplateService

This service acts as a central place for creating the code snippets needed to run your automated trading strategies. Think of it as a code generator, pulling together pieces for different parts of your backtesting process. It uses a large language model (Ollama) to help generate these code snippets, especially when it comes to creating trading signals.

It handles several key components: setting up the trading environment (exchange configuration), defining the strategies to test, organizing the timeframe data, and even generating the code to launch and monitor your tests. It's designed to work with multiple timeframes, providing structured data for signals, and includes debugging tools that save important information to a designated folder.

You can customize parts of this code generation process through configuration, allowing you to tailor the templates to your specific needs.  Specifically, it can produce code for comparing strategies (Walker templates), setting up individual strategies, configuring exchange connections, defining timeframes, launching the tests, and creating helper functions for text and JSON output.  The JSON output for trading signals follows a specific structure including position, note, price levels, and an estimated duration.

## Class OptimizerSchemaService

This service helps you keep track of and manage the configurations for your optimizers, like ensuring they all have the necessary settings. It acts as a central place to store and retrieve these configurations, making sure they're consistent and valid. 

Think of it as a librarian for your optimizer setups. You can register new configurations, and it's designed to check that they have the essential pieces in place, such as a name, training range, data source, and prompt generation method.

If you need to tweak an existing configuration, you can partially update it, and this service will intelligently merge your changes with the original settings. It also lets you easily retrieve a specific optimizer configuration by its name when you need it.

## Class OptimizerGlobalService

This service acts as a central hub for working with optimizers, ensuring everything is done correctly before proceeding. It keeps track of operations and verifies that the optimizer you're trying to use actually exists. 

Think of it as a gatekeeper – you request data, code, or a saved file, and this service makes sure everything is valid before passing your request on to the underlying components. 

It uses a logger to keep a record of what's happening, a validation service to confirm the optimizer is present, and a connection service to handle the actual work.

You can use it to retrieve data about optimizers, generate complete strategy code, or save the generated code to a file.

## Class OptimizerConnectionService

The OptimizerConnectionService is like a central hub for getting and managing your optimizers. It’s designed to be efficient by keeping frequently used optimizers stored and ready to go, avoiding the overhead of creating them repeatedly. 

Think of it as a smart cache for your optimizers, keyed by their name.  It also handles combining your custom optimizer settings with default settings, making sure you have the configurations you need.

You can use it to:

*   Get an existing optimizer or create a new one.
*   Fetch data and create metadata for your strategies.
*   Generate the actual code that will run your strategies.
*   Save the generated code to a file for later use.

It uses services like a logger and a schema service to do its work, keeping things organized.

## Class LoggerService

The LoggerService is your central hub for consistent logging within the backtest-kit framework. It makes sure your log messages are always informative, automatically adding details about where the log originated, such as the strategy, exchange, and the current frame. 

You can customize it by providing your own logger implementation, but if you don't, it will fall back to a basic "no-op" logger that doesn't actually write anything. It has several methods for different log levels: general messages (`log`), detailed debugging info (`debug`), informational messages (`info`), and warnings (`warn`).  The `setLogger` method allows you to plug in your preferred logging library.

## Class LiveUtils

LiveUtils provides tools to help you run and monitor live trading strategies. It's designed to simplify the process and make it more robust.

The `run` method is your primary way to execute a live trading strategy; it’s an ongoing process that generates results and automatically recovers from crashes by saving its progress.  It allows you to run trading strategies continuously and get results as they happen.

If you need to run a live trading process solely for things like updating a database or triggering external actions, the `background` method lets you do that without needing to process the actual trading results. This runs silently in the background until the program stops.

You can also get a snapshot of how your trading is performing with `getData`, which provides statistical data, or generate a detailed report with `getReport`.  Finally, `dump` allows you to easily save those reports to a file.

## Class LiveMarkdownService

The LiveMarkdownService helps you automatically generate and save detailed reports about your trading strategies. It listens for every signal event – like when a strategy is idle, opens a position, is active, or closes a trade – and carefully records all the information. 

It then organizes this data into readable markdown tables, providing valuable insights into your strategy's performance, including things like win rate and average profit. These reports are saved as `.md` files in a designated folder, making it easy to review your trading history.

The service is designed to be simple to use: it automatically sets itself up and handles the report generation process. You can also clear the stored data if needed, either for a specific strategy or all strategies at once. It’s like having a diligent assistant keeping track of all your trades and neatly presenting the results.


## Class LiveLogicPublicService

This service helps you run live trading, handling all the details behind the scenes so you can focus on your trading logic. It simplifies things by automatically managing context information like the strategy and exchange names, meaning you don’t need to pass these values explicitly with every function call. 

Think of it as a continuous, ongoing process that generates trading signals—both signals to open and close positions—as an endless stream.  It’s designed to be resilient; if something goes wrong, the system can recover and resume trading from where it left off, thanks to saved state.  The service uses the current time to track progress in real-time, ensuring accurate and timely trading decisions. It also relies on a logger service to keep track of what's going on.

## Class LiveLogicPrivateService

This service helps you run live trading strategies in a continuous, real-time fashion. It works by constantly monitoring the market and reacting to signals. Think of it as an engine that keeps your trading logic running without interruption, recovering automatically if anything goes wrong.

It uses an infinite loop to keep the process going, regularly checking for new signals and reporting only when positions are opened or closed. The data is streamed to you efficiently, meaning it’s memory-friendly and avoids unnecessary processing.  The `run` method is the main entry point, taking the trading symbol as input and returning a stream of trading results. Because it's an infinite generator, it never stops until you explicitly halt the process.

## Class LiveCommandService

This service acts as a central hub for handling live trading operations within the backtest-kit framework. It simplifies how different parts of the system interact, especially when it comes to injecting dependencies.

Think of it as a bridge between the core trading logic and the public-facing API. 

It provides access to various supporting services, like logging, validation, and schema handling, all necessary for a smooth live trading experience. 

The key function, `run`, is the workhorse—it starts the live trading process for a specific symbol and continuously generates trading results. This process is designed to be robust, automatically recovering from unexpected errors to keep trading going.

## Class HeatUtils

This class helps you visualize and analyze the performance of your trading strategies using heatmaps. Think of it as a handy tool for getting a quick, clear picture of how different assets performed within a specific strategy.

It gathers statistics like total profit, Sharpe Ratio, maximum drawdown, and trade counts for each symbol used in a strategy. The class automatically collects this data from your closed trades, so you don't have to do the aggregation yourself.

You can easily retrieve the raw data as a structured object, or request a nicely formatted markdown report, showing the symbols sorted by their overall profitability.  You can even save these reports directly to your hard drive, creating a convenient log of your strategy’s history. It’s designed to be easy to use, with a single instance available for simple access.

## Class HeatMarkdownService

The Heatmap Service helps you visualize and analyze your trading performance across different strategies. It collects data from closed trades, calculating key metrics like total profit, Sharpe Ratio, and maximum drawdown for each symbol and overall portfolio. 

It creates a dedicated storage space for each strategy, keeping their data separate.  You can request the calculated statistics or generate a nicely formatted Markdown report to easily share or review your results. 

The service is designed to handle tricky calculations that might result in errors (like dividing by zero) and it automatically sets itself up when you first use it. You can also clear the accumulated data when it’s no longer needed, either for a specific strategy or for all strategies.

## Class FrameValidationService

The FrameValidationService helps ensure your trading strategies are working with the right data structures. Think of it as a gatekeeper for your data frames.

You start by registering your expected data frame layouts – essentially, telling the service what each frame *should* look like.  This is done using the `addFrame` method, where you specify the frame’s name and its schema.

The `validate` method then allows you to check if a particular data frame exists and conforms to the registered schema.

Finally, `list` provides a quick way to see all the frame schemas that you've registered with the service, giving you an overview of the data structures your system expects. This helps in debugging and maintaining a clear understanding of your trading system’s data requirements.

## Class FrameSchemaService

The FrameSchemaService acts as a central place to store and manage the structure of your trading frames. It uses a type-safe registry to keep track of these structures, ensuring consistency across your backtesting system. 

You can add new frame schemas using the `register` method, and update existing ones with `override`. To access a specific frame structure, use the `get` method, providing its name to retrieve it. This service also includes validation to make sure your frame structures are correctly formed before they’re stored.

## Class FrameGlobalService

This service manages how your backtesting framework gets the timeframes it needs for analysis. It works closely with a connection service to retrieve timeframe data and a validation service to ensure the data is correct. 

Think of it as the central hub for defining when your trading strategies will be tested – whether that’s daily, hourly, or some other interval. 

The `getTimeframe` function is the main tool it offers, allowing you to request a specific timeframe array for a given trading symbol and timeframe name. This function is what ultimately provides the timestamps your backtesting logic will iterate over.

## Class FrameConnectionService

This service acts as a central point for working with trading frames, like historical data sets. It figures out which specific frame implementation to use based on the current method context, effectively directing requests to the right place. 

To make things efficient, it remembers which frame implementations it's already created – it caches them so you don't have to recreate them every time. 

You can ask this service to get a frame by its name, and it will handle creating it if it doesn't already exist.

When performing backtests, it also manages the timeframe – getting the start and end dates for a particular symbol and frame, allowing you to control the time period you're testing against. It's worth noting that when in live mode, there isn't a frame, so the frame name will be empty.

The service depends on other components like a logger, a frame schema service, and a method context service to function properly.

## Class ExchangeValidationService

The ExchangeValidationService helps you keep track of and verify the structure of your exchange data. Think of it as a central place to define how different exchanges should look, and then check if your data fits those expectations. 

You can add new exchange definitions, each outlining the expected format.  The service provides a way to validate data against these defined schemas, ensuring consistency. It also allows you to view a list of all the exchanges you've registered. This is useful for maintaining a clean and predictable data flow within your backtesting environment.

## Class ExchangeSchemaService

This service acts as a central place to store and manage the details of different cryptocurrency exchanges, like Binance or Coinbase. It uses a special system to keep track of these exchange details in a way that prevents errors. 

You can add new exchanges using the `addExchange()` function (represented as `register` here), and then retrieve them later by their unique name using the `get()` function. 

Before a new exchange is added, the system checks to make sure it has all the necessary information with the `validateShallow()` function.  If an exchange already exists, you can update some of its details without replacing the entire record using the `override()` function. The service also keeps a record of its activities using a logger.

## Class ExchangeGlobalService

The ExchangeGlobalService acts as a central hub for interacting with an exchange, providing a way to inject important context like the trading symbol, time, and backtesting parameters into each operation. It builds upon other services to manage those details.

Inside, it keeps track of things like logging, the connection to the exchange, and validation processes.  It caches exchange configurations to speed up validation, avoiding repeated checks.

You can use it to retrieve historical candle data, and in backtesting scenarios, it also provides the ability to fetch candles from the future. It can calculate the average price, and format price and quantity values – all while incorporating the injected execution context.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges. It handles the complexity of connecting to various exchanges by automatically routing requests to the correct implementation based on the current context. It's designed to be efficient, remembering previously used exchange connections to avoid unnecessary setup.

This service provides a simplified way to get historical price data (candles), fetch the next set of candles for backtesting or live trading, retrieve the average price of an asset, and correctly format prices and quantities to match the specific rules of each exchange. Think of it as a translator and organizer, ensuring your requests are properly understood and executed by the right exchange. The service also keeps track of its connections for speed and logs all activity. It relies on other services to understand which exchange is being used and to retrieve exchange-specific information.

## Class ConstantUtils

This class provides helpful, pre-calculated values for setting take-profit and stop-loss levels, based on a Kelly Criterion approach with a focus on managing risk. These constants represent percentages of the total distance to your target profit or loss. 

For example, `TP_LEVEL1` (set at 30) means the first take-profit target is reached when the price moves 30% of the way towards the final profit target.  `TP_LEVEL2` and `TP_LEVEL3` offer subsequent take-profit levels at 60% and 90% respectively, allowing you to lock in profits gradually.

Similarly, `SL_LEVEL1` (40) provides an early warning signal for a potential reversal, while `SL_LEVEL2` (80) represents a final exit point to minimize potential losses.  These constants give you a starting point for implementing a disciplined trading strategy.

## Class ClientSizing

This component, ClientSizing, helps determine how much of your capital to allocate to a trade. It's designed to be flexible, offering different sizing approaches like fixed percentages, the Kelly Criterion, and using Average True Range (ATR). You can also set limits on the minimum and maximum position sizes, as well as a maximum percentage of your capital to risk on any single trade. Furthermore, you can hook in custom validation or logging functions to tailor the sizing process to your specific needs. Essentially, it takes information about a trade opportunity and figures out the right size for your position.

## Class ClientRisk

The ClientRisk component helps manage risk across your trading strategies, preventing them from exceeding predefined limits. It's designed to be shared by multiple strategies, allowing for a holistic view of your portfolio's risk exposure.

Think of it as a gatekeeper – before a strategy can open a position, ClientRisk checks if doing so would violate any established rules, such as exceeding the maximum number of concurrent positions. It also allows you to define your own custom validation checks, giving you maximum flexibility.

ClientRisk maintains a record of all currently open positions, and this information is automatically saved and reloaded when needed. The `checkSignal` method is the core of the risk management process; it analyzes each potential trade and determines if it's safe to execute. When a signal is opened or closed, the `addSignal` and `removeSignal` methods are used to update the internal record of active positions.

## Class ClientOptimizer

The ClientOptimizer handles the behind-the-scenes work of running optimization processes. It gathers data from different sources, breaks it down into manageable chunks, and prepares everything for the optimization engine. 

It's responsible for building a history of interactions with the language model used to generate trading strategies, ensuring context is maintained throughout the process. This class also creates the actual strategy code, combining various components like imports, helper functions, the core strategy logic, and the code needed to execute it. 

Finally, you can use it to save the generated strategy code directly to a file, automatically creating any necessary directories to keep your projects organized. This streamlines the process of taking your optimized strategies from the optimization engine to executable code.

## Class ClientFrame

The ClientFrame handles creating the timelines your backtesting runs use. Think of it as the engine that provides the sequence of dates and times your trading strategies will be tested against.

It’s designed to be efficient; it remembers previously generated timelines, so it doesn't recreate them unnecessarily, which speeds up your backtesting.

You can control how far apart these timestamps are, ranging from one minute to three days, giving you flexibility in the granularity of your tests.

ClientFrame also allows you to add custom checks and logging during timeline creation, giving you more control and visibility into the process. It works closely with the BacktestLogicPrivateService to manage the historical data for your backtests. The `getTimeframe` method is the key to getting these timelines – it’s cached for performance and generates date arrays for a specific trading symbol.

## Class ClientExchange

This class, `ClientExchange`, acts as a bridge to access real-time and historical market data. It provides tools for backtesting strategies by letting you retrieve both past and future candle data. You can fetch historical candles to analyze past performance and future candles to simulate signal execution.

It also offers a convenient way to calculate the VWAP (Volume Weighted Average Price) to determine average trading prices.  If no volume data is available, it defaults to the average of closing prices.

Finally, it helps ensure your trade quantities and prices are formatted correctly for the exchange you're connected to, avoiding potential issues with precision. All of its functions are optimized to conserve memory.

## Class BacktestUtils

The `BacktestUtils` class offers helpful tools for running and analyzing backtests within the framework. It’s designed to be easily accessible, functioning as a single, always-available resource.

You can use the `run` function to execute a backtest for a specific trading symbol and automatically logs the results. If you just need to run a backtest to trigger side effects, like logging or callbacks, the `background` function lets you do that without needing to handle the individual results.

To retrieve statistical information about past backtest runs, `getData` provides data for a specific symbol and strategy combination.  Need a nicely formatted report? `getReport` generates a markdown document summarizing the closed signals. Finally, `dump` allows you to save those reports directly to a file on your system.

## Class BacktestMarkdownService

The BacktestMarkdownService helps you create and save reports detailing your backtesting results. It listens for signals during backtests, keeping track of closed trades for each strategy you’re testing. 

It organizes this data, generating well-formatted markdown tables showing the specifics of each closed trade. These reports are saved as files, making it easy to review your strategy's performance. 

The service manages storage for this data efficiently, ensuring each symbol and strategy combination has its own dedicated space.  You can clear this stored data when needed, either for specific strategy/symbol combinations or to completely reset the reports.  The service is designed to initialize automatically when first used, streamlining the process of generating your backtest reports.


## Class BacktestLogicPublicService

This service acts as a convenient way to run backtests, handling the background details of keeping track of things like your strategy’s name, the exchange you're using, and the timeframe you're analyzing. 

Think of it as a layer on top of the core backtesting engine that simplifies how you interact with it. 

You don't have to constantly pass around information about your strategy; it's automatically handled for you. 

The `run` method is your primary tool – you provide the symbol you want to backtest, and it generates results step-by-step, seamlessly injecting the necessary context into all the functions used during the process.


## Class BacktestLogicPrivateService

This service handles the core logic of running backtests, making the process efficient and manageable. It works by pulling timeframes from a frame service and stepping through them, simulating trading activity. Whenever a trading signal appears (an opportunity to buy or sell), it fetches the necessary historical data and runs the backtest algorithm. To minimize memory usage, results are streamed one by one instead of building a huge list. You can also stop the backtest at any time by interrupting the stream. 

This service relies on several other services to get data and manage the overall backtesting environment. It’s designed to provide a clean, asynchronous way to run simulations and analyze trading strategies. The primary function is `run`, which takes a symbol (like "BTC/USD") and returns a stream of backtest results.

## Class BacktestCommandService

This service acts as a central point for running backtests within the backtest-kit framework. It's designed to be easily integrated into your application using dependency injection.

Think of it as a simplified interface to the core backtesting engine. It handles the behind-the-scenes work of setting up and executing a backtest. 

The key method, `run`, is your primary tool. You give it a symbol (like a stock ticker) and some context—telling it which strategy, exchange, and frame to use—and it will generate a series of backtest results. This allows you to systematically evaluate and refine your trading strategies. 

The service also internally uses other services, like those responsible for logging, schema handling, and validation, so you don’t need to worry about those details directly.

# backtest-kit interfaces

## Interface WalkerStatistics

WalkerStatistics helps you understand how different trading strategies performed during a backtest. Think of it as a consolidated report card. 

It builds upon the standard WalkerResults, adding extra information specifically for comparing strategies against each other. 

The key piece of information it holds is `strategyResults`, which is simply a list of results, one for each strategy you tested. This list lets you easily see and analyze how each strategy fared.

## Interface WalkerContract

The `WalkerContract` provides updates on the progress of comparing different trading strategies. Think of it as a live report during the backtesting process. Each time a strategy finishes its test and its ranking is determined, this contract sends out an event with details like the strategy's name, the exchange and symbol being tested, and key statistics.

You'll find information about the optimization metric being used, the current best metric value seen so far, and the strategy currently holding that top spot. It also tells you how many strategies have already been tested and how many are left to go, providing a clear picture of how much longer the comparison will take. Essentially, this contract keeps you informed about the backtesting competition's status.


## Interface TickEvent

The `TickEvent` interface holds all the important data about what happened during a trade. Think of it as a standard record, so you can consistently analyze events whether it's a new trade opening, an ongoing trade, or a trade closing. Each event includes a timestamp, the type of action that occurred (like idle, opened, closed), and details specific to that action.

For trades that are actively running or have been closed, you'll find information such as the signal ID, position type, any notes attached to the signal, the opening price, take profit level, stop loss, and the P&L. Closed trades also include the reason for closing and the trade duration. This standardized structure makes it easy to build reports and understand the complete lifecycle of each trade.

## Interface ScheduleStatistics

ScheduleStatistics helps you understand how your scheduled signals are performing. It gives you a breakdown of all events – both those that were scheduled and those that were cancelled. 

You can see the total number of events, how many were scheduled, and how many were cancelled. 

The cancellation rate tells you what percentage of your scheduled signals were cancelled, a lower rate generally indicates better signal quality. Finally, the average wait time for cancelled signals gives you an idea of how long signals waited before being cancelled. This data can help you fine-tune your trading strategies.

## Interface ScheduledEvent

This interface holds all the details about scheduled or cancelled trading events, making it easy to generate reports and analyze performance. 

Each event, whether it was scheduled or later cancelled, is represented with a timestamp, the type of action taken, the trading symbol involved, and a unique signal ID. 

You'll also find information about the position type, any notes associated with the signal, and key pricing data like the current market price, scheduled entry price, take profit, and stop loss levels. 

For cancelled events, it includes the close timestamp and the duration the event was active. This consolidated information allows for a clear understanding of what happened and when.

## Interface ProgressWalkerContract

This interface describes the updates you'll receive while a background process, like evaluating strategies, is running. It provides details about what's happening, including the name of the process, the exchange and frame being used, and the trading symbol involved. 

You’re given the total number of strategies being analyzed, along with the count of strategies already completed. Finally, a percentage value indicates how far along the process is, ranging from 0% to 100%. Think of it as a progress bar for your backtesting!

## Interface ProgressOptimizerContract

This interface helps you keep an eye on how your backtest kit optimizer is doing. It provides updates as the optimizer runs, letting you know which optimizer is active and what trading symbol it's working with.  You'll see information about the total number of data sources the optimizer needs to analyze, how many it’s already finished, and the overall percentage of completion. Essentially, it's a progress report for your optimization process.

## Interface ProgressBacktestContract

This interface helps you keep an eye on how a backtest is progressing. It’s designed to be sent as updates while a backtest runs in the background. 

Each update provides key details, like the name of the exchange and strategy being used, the trading symbol, and how many historical data points (frames) are being processed. You'll see the total number of frames the backtest needs to analyze, the number it has already handled, and a percentage indicating overall completion. This gives you a clear picture of the backtest’s status without having to wait for it to finish.

## Interface PerformanceStatistics

This data represents the overall performance of a trading strategy, giving you a broad picture of how it performed. It tells you the name of the strategy being evaluated and the total number of performance events that were tracked. You'll also find the total time the strategy took to run across all its measurements.

The `metricStats` property breaks down the performance even further, grouping statistics by different performance metrics. Finally, `events` provides access to all the raw performance data points recorded, allowing for a more detailed analysis.

## Interface PerformanceContract

This interface helps you keep track of how your trading strategies are performing. It records key information about various operations, like how long they take to execute. 

Think of it as a way to profile your code – you’ll get timestamps, durations, and details about the strategy, exchange, and symbol involved. It's especially useful for identifying slowdowns or bottlenecks in your backtesting or live trading environments.

Each recorded event provides a timestamp, a reference to the previous event's timestamp (if available), the type of operation being measured, the duration, and the relevant names and identifiers related to the trading activity.  You can easily distinguish between metrics gathered during backtesting and those generated during live trading thanks to the `backtest` property.

## Interface PartialStatistics

This interface holds data about the performance of your trading strategy when you’re using partial fills or taking profits/losses in chunks. It allows you to track key metrics related to these partial events. 

You’re able to see a detailed list of each individual profit or loss event via the `eventList` property.  The `totalEvents` property simply tells you the overall count of all events recorded. If you need to know how many times your strategy made a profit, `totalProfit` gives you that number. Similarly, `totalLoss` tells you the number of times your strategy experienced a loss due to partial fills or profit taking.

## Interface PartialProfitContract

This interface defines what happens when a trading strategy hits a partial profit milestone, like 10%, 20%, or 30% gain. It’s designed to help you keep track of how your strategy is performing and when it's taking partial profits.

Each time a profit level is reached, an event is generated containing important information: the trading pair involved ("BTCUSDT" for example), all the details about the original signal that triggered the trade, the current market price, the specific profit level achieved (10%, 20%, etc.), whether the event is from a backtest or live trading, and the exact time it happened.

These events are used by reporting services and can also be listened to directly through your code to build custom monitoring or notification systems. You're guaranteed that each level is only reported once per signal, even if the market moves quickly.


## Interface PartialLossContract

This interface defines what information is shared when a trading strategy hits a partial loss level, like a -10%, -20%, or -30% drawdown. 

You’re notified about these events through the framework to track how your strategy is performing and when stop-loss mechanisms are triggered. The information provided includes the trading symbol (e.g., BTCUSDT), all the details of the signal that triggered the loss, the price at which the loss was reached, and the specific loss level (e.g., 20 represents a -20% loss). 

The notification also indicates whether the event occurred during a backtest (historical data) or live trading, and the exact time the event was detected. These events are designed to be used by reporting services or directly by your own code to monitor strategy performance.

## Interface PartialEvent

The `PartialEvent` provides a standardized way to track important profit and loss milestones during trading, whether it’s a backtest or live trading. Think of it as a snapshot of what happened at a specific moment – when a profit or loss level was hit. 

Each event includes details like the exact time it occurred (`timestamp`), whether it was a profit or a loss (`action`), the trading pair involved (`symbol`), a unique identifier for the trading signal (`signalId`), the position type, the market price at that time (`currentPrice`), and the profit/loss level that was reached (`level`).  A flag (`backtest`) indicates whether the event happened during a backtest simulation or in a live trading environment. This structured data makes it easier to generate reports and analyze trading performance.

## Interface MetricStats

The `MetricStats` object holds all the key statistics calculated for a particular performance metric during a backtest. It tells you how many times a specific action or event occurred, the total time it took across all instances, and important measures of its performance like average, minimum, maximum, and standard deviation. You'll also find percentile values like the 95th and 99th to understand how durations spread out. Finally, it includes data about the waiting time between those events, allowing you to analyze the timing and responsiveness of your trading system.

## Interface MessageModel

This `MessageModel` represents a single turn in a conversation with a language model. Think of it as a container for one message – whether it's an instruction from the system, a question from the user, or a response from the AI. 

Each message has a `role` that tells you who sent it: the system providing instructions, the user asking a question, or the assistant (the LLM) providing a response. The `content` property holds the actual text of that message – the words being exchanged. This model is key to building prompts for the Optimizer and keeping track of the conversation's flow.

## Interface LiveStatistics

This interface provides a detailed look at your live trading performance, offering a wide range of statistics to help you understand how your strategy is doing. It tracks every event – from idle periods to trade openings, activity, and closures – allowing for a complete picture of your trading history.

You'll find key metrics like the total number of events, the number of winning and losing trades, and the overall win rate. The average PNL (profit and loss) per trade and the cumulative PNL across all trades are also provided, giving you a sense of profitability.

To gauge risk and return, statistics such as standard deviation (volatility), Sharpe Ratio, and annualized Sharpe Ratio are included. The Certainty Ratio helps assess the reliability of winning versus losing trades, and Expected Yearly Returns offer a projection of potential annual gains. All numeric values are carefully managed, and will be null if the calculation is unreliable.

## Interface IWalkerStrategyResult

This interface, `IWalkerStrategyResult`, holds the outcome of running a single trading strategy during a backtest comparison. It bundles together essential information about that strategy’s performance.

You'll find the strategy's name listed, along with a comprehensive set of backtest statistics detailing its behavior. A key metric, used to evaluate and compare strategies, is also included, and may be null if the strategy wasn’t properly evaluated. Finally, a rank position indicates how well the strategy performed relative to the others in the comparison—a rank of 1 represents the top performer.

## Interface IWalkerSchema

The IWalkerSchema lets you set up A/B tests for different trading strategies within your backtesting environment. Think of it as a blueprint for comparing how well various strategies perform under the same conditions.

You're required to give each walker a unique name so the system knows how to identify it. A short note is also helpful for documentation purposes. 

The schema dictates which exchange and timeframe your strategies will be tested on. You’re defining which strategies to compare—they need to be registered with the system beforehand.  

You can choose which metric you want to optimize, though Sharpe Ratio is the default. Finally, you have the option to add custom callbacks for different stages of the walker's lifecycle, allowing for more control and monitoring.

## Interface IWalkerResults

This object holds all the results you get after a walktest, which is essentially comparing several trading strategies against each other. It tells you which strategy performed best, what the metric used for comparison was, and the overall statistics of that winning strategy. You'll find information about the specific trading symbol, the exchange used, and the timeframe (frame) the walktest was run on. It also includes the total number of strategies that were tested during the walktest.

## Interface IWalkerCallbacks

The `IWalkerCallbacks` interface lets you hook into the backtest kit's comparison process, allowing you to perform actions at key points. You can be notified when a specific strategy begins testing, receiving the strategy's name and the trading symbol involved. 

Once a strategy's backtest is finished, the `onStrategyComplete` callback provides statistics and a metric value. If a strategy encounters an error during its backtest, `onStrategyError` will alert you with the error details. 

Finally, when all strategies have been tested, `onComplete` delivers the overall results of the walker. This provides a way to monitor progress, log events, or react to specific outcomes as the backtesting process runs.

## Interface IStrategyTickResultScheduled

This interface represents a special tick result, signaling that a trading strategy has generated a scheduled signal and is now waiting for the price to reach a specific entry point. Think of it as the framework letting you know a plan has been put in motion, but the actual trade hasn't happened yet. 

It provides key information about this scheduled signal, including the strategy's name, the exchange being used, the trading symbol (like BTCUSDT), the current price at the time the signal was created, and most importantly, the `signal` object itself which holds the details of the planned trade. This result is useful for monitoring and understanding what your strategies are doing before a trade is executed.


## Interface IStrategyTickResultOpened

This result tells you when a new trading signal has been created by your strategy. It happens after your strategy’s logic has validated the potential signal and saved it to the database. 

You’re given key details about the signal, including its unique identifier, the name of the strategy that generated it, and the exchange and symbol it relates to.  The current VWAP price at the time the signal was created is also provided, which can be helpful for analyzing performance. Essentially, this result is your notification that a new trading opportunity has been identified and is ready for potential execution.

## Interface IStrategyTickResultIdle

This interface represents what happens when your trading strategy isn't actively making any trades – it's in an idle state. It provides information about why the strategy is idle, including the strategy's name, the exchange it's connected to, the trading symbol, and the current price. Essentially, it's a snapshot of the market conditions when your strategy is waiting for a new trading opportunity. You’ll see this result when the strategy isn't reacting to any signals. It includes the current price, so you can monitor the market even when no trades are happening.

## Interface IStrategyTickResultClosed

This interface represents the result when a trading signal is closed, providing a complete picture of what happened and the outcome. It tells you that a signal has finished, giving you details like the completed signal itself, the final price used for calculations, and the reason for the closure - whether it was due to a time limit, a take-profit target, or a stop-loss trigger. 

You’ll also find the exact timestamp of the closure, a breakdown of the profit and loss including fees and slippage, and identification details for both the strategy and the exchange used. This result set provides all the information needed to analyze why a trade closed and how it performed.


## Interface IStrategyTickResultCancelled

This interface describes what happens when a scheduled trading signal is cancelled. It's used to report that a signal didn't result in a trade being placed, perhaps because it was cancelled before it could trigger an order or because a stop-loss was hit before an entry. 

The report includes details about the cancelled signal itself, like the signal row data. You'll also find the final price at the time of cancellation, along with timestamps and identifiers for the strategy and exchange involved, and the trading symbol. This information helps you track why signals weren't executed and analyze your strategy's performance.


## Interface IStrategyTickResultActive

This interface represents a trading scenario where your strategy is actively monitoring a signal, waiting for a specific event like a stop-loss being hit, a take-profit being reached, or a time limit expiring. It tells you that the strategy is "active" in a trade. 

The interface provides key information about the active trade, including the signal that triggered it, the current price being watched (typically VWAP), the name of the strategy being used, and the exchange and symbol involved in the trade. Think of it as a snapshot of a trade in progress, providing context for what's happening.

## Interface IStrategySchema

This interface, `IStrategySchema`, is how you define and register your trading strategies within the backtest-kit framework. Think of it as a blueprint for how your strategy will generate trading signals. 

Each strategy gets a unique `strategyName` for identification. You can add a `note` to provide helpful documentation for yourself or others.  The `interval` property controls how frequently your strategy can be evaluated, preventing it from overwhelming the system.

The core of the schema is the `getSignal` function. This is where your strategy's logic resides; it’s responsible for deciding when to buy or sell. It receives the symbol and a timestamp, and it should return a signal or `null` if no action is needed. You can also use the `priceOpen` feature within this function to create signals that wait for prices to reach a specific entry point. 

`callbacks` allows you to define functions to run when your strategy opens or closes a position, letting you track events like order executions. Finally, `riskName` helps categorize your strategy for risk management purposes.

## Interface IStrategyResult

This interface, `IStrategyResult`, is designed to hold all the information needed to evaluate and compare different trading strategies after a backtest. Each `IStrategyResult` represents a single strategy run and includes its name so you know which strategy it is. It also contains a comprehensive set of statistics about the backtest, giving you a detailed picture of how the strategy performed. Finally, it holds the metric value used to rank the strategies, which helps you quickly identify the best performers. Think of it as a single row in a comparison table of your strategies.

## Interface IStrategyPnL

This interface describes the results of a strategy's profit and loss calculation. It breaks down how much your strategy gained or lost, taking into account the impact of transaction fees and slippage – those small differences between the expected price and the actual price you get when executing trades. The `pnlPercentage` tells you the overall profit or loss as a percentage of your initial investment. You can see the entry price, `priceOpen`, adjusted for fees and slippage, and the exit price, `priceClose`, similarly adjusted, allowing you to understand precisely how these factors affected your results.

## Interface IStrategyCallbacks

This interface lets you hook into different stages of your trading strategy's lifecycle. Think of it as a way to get notified about what’s happening behind the scenes.

You can receive updates when a new signal is opened, when a signal is actively being monitored, or when things go quiet and the system enters an idle state. It also gives you callbacks for when signals are closed, scheduled for later entry, or cancelled altogether.

Beyond the core signal states, you're also alerted when a signal reaches a partial profit or partial loss – these are useful for custom logic around those intermediate stages. Finally, the `onTick` callback provides a notification for every price update, and `onWrite` is used for persisting signal data during testing.

## Interface IStrategy

The `IStrategy` interface outlines the essential methods a trading strategy must have within the backtest-kit framework.

The `tick` method is the heart of strategy execution, handling each incoming price update. It performs calculations, looks for opportunities to enter or exit trades, and keeps track of any existing stop-loss or take-profit orders.

`getPendingSignal` lets you check if a trade is already in progress for a specific asset – it's used to monitor those existing stop-loss and take-profit orders or check expiration times.

For quick testing and analysis, the `backtest` method rapidly simulates trading using historical price data, allowing you to see how the strategy would have performed.

Finally, `stop` provides a way to pause the strategy from creating new signals, but it won't automatically close any existing trades. This is useful for safely shutting down the strategy in a live environment.

## Interface ISizingSchemaKelly

This interface defines how to size your trades using the Kelly Criterion, a strategy aiming to maximize growth rate. When implementing sizing logic, you're essentially telling the backtest-kit how much of your capital to allocate to each trade. 

The `method` property is fixed and must be "kelly-criterion" to indicate you're using this sizing approach. The `kellyMultiplier` determines how aggressively you’re applying the Kelly Criterion; a lower value (like the default of 0.25) is a more conservative approach, while a higher value uses a larger percentage of your capital per trade.

## Interface ISizingSchemaFixedPercentage

This schema defines a simple way to size your trades – by consistently risking a fixed percentage of your capital on each one. The `method` property is set to "fixed-percentage" to identify it as such.  You’ll also specify the `riskPercentage`, which represents the percentage of your capital you’re comfortable losing on any single trade; it’s a number between 0 and 100. This ensures each trade carries the same level of financial risk.

## Interface ISizingSchemaBase

This interface, `ISizingSchemaBase`, acts as a foundation for defining how much of your account you’re willing to risk on each trade. Think of it as the blueprint for your sizing strategy. 

It requires a unique name to identify the sizing configuration and allows for an optional note to explain it. You’re also able to set limits on position size, both as a percentage of your total account balance and as a specific quantity. Finally, you can define callbacks to customize the sizing process at different stages.

## Interface ISizingSchemaATR

This schema defines how your trades will size positions based on the Average True Range (ATR). 

It's designed to help manage risk by adjusting trade sizes according to market volatility, as measured by the ATR. 

The `riskPercentage` property specifies the maximum percentage of your capital you're willing to risk on each trade. The `atrMultiplier` determines how much the stop-loss distance will be based on the ATR value; a higher multiplier means a wider stop. Essentially, this schema provides a structured way to connect risk management with market volatility when determining position sizes.

## Interface ISizingParamsKelly

This interface defines how you can control the sizing of trades when using the Kelly Criterion within the backtest-kit framework. It’s really about specifying how much of your capital you want to risk on each trade based on the Kelly formula. 

You’re required to provide a logger, which is helpful for keeping track of what’s happening during your backtesting process, allowing you to debug and understand the sizing decisions being made. Think of it as a way to get feedback on how the Kelly Criterion is influencing your trade sizes.

## Interface ISizingParamsFixedPercentage

This interface, `ISizingParamsFixedPercentage`, defines how to calculate the size of trades when using a fixed percentage approach. It's used when setting up a trading strategy with `ClientSizing`.

Essentially, it tells the system what percentage of your available capital to risk on each trade.

The interface requires a `logger` which is used to record helpful debugging information about the sizing calculations. This logger helps you understand how your trade sizes are being determined and to troubleshoot any issues.

## Interface ISizingParamsATR

This interface, `ISizingParamsATR`, helps you define how your trading strategy determines the size of each trade when using an ATR (Average True Range) based sizing method. It's primarily used when creating a `ClientSizing` object.

You'll use this to configure how much of your capital you want to risk on each trade, based on the ATR value. 

The `logger` property allows you to connect a logging service so you can keep track of what's happening and debug any issues during backtesting. This helps you understand how your sizing parameters are affecting your trades.

## Interface ISizingCallbacks

The `ISizingCallbacks` interface lets you hook into the sizing process of the backtest kit. Specifically, the `onCalculate` callback is triggered right after the framework determines how much of an asset you should buy or sell. This is a great place to keep an eye on the sizing logic – maybe log the quantity being considered or double-check that the size calculation looks reasonable for your strategy. Think of it as a way to peek behind the curtain of how your positions are being sized.

## Interface ISizingCalculateParamsKelly

This interface defines the information needed to calculate trade sizing using the Kelly Criterion. To use it, you'll need to provide the win rate, which represents the probability of a trade being profitable, and the win/loss ratio, reflecting the average profit compared to the average loss when a trade wins. These two values allow the framework to determine an optimal size for each trade, aiming to maximize long-term growth. Essentially, it's a way to let the system intelligently decide how much to risk on each trade based on its expected performance.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the information needed to calculate trade sizes using a fixed percentage approach. Essentially, it tells the backtest kit how much of your capital you want to risk on each trade as a percentage. 

You're providing two key pieces of data: the method used for sizing (which is "fixed-percentage" in this case) and the stop-loss price. The stop-loss price helps determine the size of the trade based on the percentage you're willing to risk between the entry price and your stop-loss.


## Interface ISizingCalculateParamsBase

This interface, `ISizingCalculateParamsBase`, provides the core information needed to figure out how much of an asset to buy or sell. It defines the essential data points that are shared across different sizing calculations. You'll find the trading symbol, like "BTCUSDT", alongside your current account balance and the expected entry price for the trade. This forms the foundation for determining appropriate trade sizes.

## Interface ISizingCalculateParamsATR

This interface defines the information needed when you're deciding how much to trade based on the Average True Range (ATR). It's used to calculate position sizes that react to market volatility—a higher ATR means more volatility, and therefore, potentially a smaller position size to manage risk. 

Specifically, you’re telling the system you want to use an "atr-based" sizing method, and you're providing the current ATR value to factor into the calculation. Think of the ATR as a measure of how much the price has been fluctuating recently; it's a key ingredient for smart position sizing.

## Interface ISizing

The `ISizing` interface is the core of how backtest-kit determines how much of an asset your strategy will trade. Think of it as the engine that figures out your position sizes. 

It has one main function, `calculate`, which takes a set of parameters representing your risk preferences and market conditions. This function then returns a number – that's the size of the position your strategy should take. This is how the framework translates your strategy's decisions into concrete trading actions.

## Interface ISignalRow

This interface, `ISignalRow`, represents a finalized trading signal ready for use within the backtest-kit framework. Think of it as the complete picture of a signal, packed with all the essential information needed to execute a trade. 

Each signal gets a unique ID, ensuring clear tracking throughout the backtesting process. The `priceOpen` tells you the entry price for the trade, while `exchangeName` and `strategyName` identify where and how the signal originated. 

You’ll also find timestamps – `scheduledAt` marks when the signal was initially created, and `pendingAt` indicates when the trade became active. The `symbol` clearly specifies the trading pair being used. Finally, `_isScheduled` is a detail used internally to manage signals.

## Interface ISignalDto

The `ISignalDto` represents a trading signal – essentially, a set of instructions for a trade. When you request a signal, this is the data structure you’ll receive. 

It contains details like the trade direction (whether to buy – "long" – or sell – "short"), a descriptive note explaining the reasoning behind the signal, and the entry price.  

You’re also given fields for setting your take profit and stop loss prices, which are crucial for managing risk and locking in gains. The framework enforces rules about these prices based on the trade direction – take profit needs to be higher for a long position and lower for a short.  

Finally, `minuteEstimatedTime` lets you specify how long you anticipate holding the position before needing to re-evaluate or exit.  If you don't provide an `id`, one will be automatically created for you.

## Interface IScheduledSignalRow

This interface, `IScheduledSignalRow`, represents a trading signal that’s waiting for a specific price to be reached before it's executed. Think of it as a signal on hold – it's not active yet.

It's based on the `ISignalRow` interface, meaning it holds all the standard signal information, but with the added feature of waiting for a target price.  

The `priceOpen` property defines the price level that the signal will activate at. Until the price hits that level, the signal remains pending.  Once the price reaches `priceOpen`, it transforms into a regular, active signal. 

The `pendingAt` field initially reflects the time the signal was scheduled, but will be updated to show the actual time when the signal starts pending.

## Interface IRiskValidationPayload

This interface, `IRiskValidationPayload`, provides all the information a risk validation function needs to do its job. Think of it as a package containing a snapshot of your portfolio’s current state. It tells you how many positions are currently open (`activePositionCount`) and gives you a detailed list of those active positions (`activePositions`), including details about each one. Essentially, it's the data you need to assess whether your trading activity is staying within acceptable risk levels.

## Interface IRiskValidationFn

This defines a special function that's used to check if your trading strategy's risk settings are okay. Think of it as a safety check before your backtest starts. The function takes your risk parameters as input and needs to confirm they're reasonable – maybe checking that your position size isn’t too large or your stop-loss isn't too close to the entry price. If something seems off, this function is designed to throw an error, stopping the backtest and letting you know there's a problem to fix.

## Interface IRiskValidation

This interface, `IRiskValidation`, helps you define checks to ensure your trading strategies are behaving as expected. Think of it as setting up guardrails for your backtesting process. 

It has two main parts: a `validate` function that actually performs the risk check, and a `note` field which is a helpful description to explain what the check is designed to do.  The `validate` function will take your risk check parameters and determine if they pass the defined criteria. The `note` is just for documentation—it's there to help you and others understand the purpose of the check.

## Interface IRiskSchema

The `IRiskSchema` interface helps you define and enforce custom risk controls for your trading portfolio. Think of it as a blueprint for how you want to manage risk. 

You specify a unique `riskName` to identify this particular risk profile. You can also add a `note` to help other developers understand what this risk schema is for.

To make your risk management even more flexible, you can provide `callbacks` to respond to different events, like when a trade is rejected or allowed. The core of this schema lies in the `validations` array, which holds the actual rules that determine whether a trade is acceptable based on your custom logic. These validations are functions or objects that you'll create to implement your specific risk constraints.

## Interface IRiskParams

The `IRiskParams` interface defines the information you provide when setting up the risk management part of your backtesting system. Think of it as configuring how the system will handle potential losses.

It's particularly important for providing a logger, which helps you keep track of what's happening during your backtesting runs – essentially, a way to debug and understand the decisions being made. This logger allows you to see what's going on under the hood and identify any potential issues.

## Interface IRiskCheckArgs

The `IRiskCheckArgs` interface provides the information needed to assess whether opening a new trade is appropriate. Think of it as a set of checks performed before a trading signal is even generated. It gathers data from the broader client strategy context, passing along crucial details like the trading pair's symbol, the name of the strategy requesting the trade, the exchange being used, the current price, and the current time. This data allows a risk management system to evaluate conditions and decide if a new position should be allowed.

## Interface IRiskCallbacks

This interface lets you hook into the risk management process within the backtest kit. You can define functions to be called when a trading signal is either rejected because it breaches risk limits, or when it successfully passes those risk checks. These callbacks provide valuable insights into why signals are being approved or denied, allowing you to monitor and potentially adjust your risk parameters. Essentially, it's a way to be notified about the outcomes of the risk assessment for each trade.

## Interface IRiskActivePosition

This interface, `IRiskActivePosition`, helps track individual trading positions as they're being managed across different strategies. Think of it as a snapshot of a trade – it contains key information like the signal that triggered it, the name of the strategy that initiated the trade, the exchange used, and when the position was opened. This allows for a broader view of risk management, looking at how different strategies interact and potentially impact each other. It's designed to be used by the `ClientRisk` component for comprehensive analysis.

## Interface IRisk

The `IRisk` interface helps you manage and control the risk associated with your trading strategies. Think of it as a gatekeeper, making sure your signals don't violate predefined risk limits.

It offers three key methods:

`checkSignal` allows you to assess if a potential trade aligns with your risk profile before it's executed.

`addSignal` keeps track of active trades, registering them when a position is opened.

`removeSignal` cleans up the record when a trade is closed, ensuring your risk calculations remain accurate. 

Essentially, this interface provides a framework to monitor and adjust your trading risk in a structured way.

## Interface IPositionSizeKellyParams

The `IPositionSizeKellyParams` interface defines the information needed to calculate position sizes using the Kelly Criterion. It helps you determine how much capital to allocate to a trade based on your expected performance. 

You’ll need to provide two key pieces of data: the `winRate`, which represents the likelihood of a winning trade (a number between 0 and 1), and the `winLossRatio`, which describes the average profit compared to the average loss when you win. These values are crucial for calculating an appropriate position size that balances potential gains and risk.

## Interface IPositionSizeFixedPercentageParams

This interface, `IPositionSizeFixedPercentageParams`, defines the information you'll provide when using a fixed percentage sizing strategy within backtest-kit. It's all about telling the framework where to set your stop-loss. Specifically, you need to provide a `priceStopLoss` value, which represents the price at which you want to automatically reduce your position size to limit potential losses. It's a simple way to ensure your trades are managed responsibly.

## Interface IPositionSizeATRParams

This interface defines the parameters needed when calculating position size using the Average True Range (ATR) method. Specifically, it focuses on the core ATR value itself.  The `atr` property represents the current ATR value, which is a key input for determining how much to trade. Think of it as telling the system how volatile the market is right now – a higher ATR suggests more risk and potentially a smaller position size.

## Interface IPersistBase

This interface defines the basic functions needed to manage data persistence, like saving, loading, and checking for the existence of information. Think of it as the foundation for how your backtest-kit framework interacts with files to store and retrieve trading data. 

The `waitForInit` method ensures that the storage directory is set up correctly and any necessary checks are run only once. `readValue` allows you to retrieve a specific piece of data identified by an ID. Before attempting to load data, you can use `hasValue` to quickly check if that data already exists. Finally, `writeValue` is used to save a new piece of data or update an existing one, ensuring that the process is reliable.

## Interface IPartialData

This interface, `IPartialData`, represents a snapshot of data that can be saved and restored, particularly useful for persisting trading signal information. Think of it as a simplified version of the full trading state. It's designed to be easily converted into a format that can be stored, like JSON.

It contains two key pieces of information: `profitLevels` and `lossLevels`.

`profitLevels` stores the profit levels the signal has achieved, converted from a collection into a list.

Similarly, `lossLevels` tracks the loss levels the signal has encountered, also represented as a list. 

Essentially, `IPartialData` allows you to save progress and reload it later, helping to keep track of where a trading signal stands.

## Interface IPartial

The `IPartial` interface is all about keeping track of how your trading signals are performing, specifically focusing on profit and loss milestones. It's used internally to monitor signals and let you know when they hit key levels like 10%, 20%, or 30% profit or loss.

When a signal is making money, the `profit` method is triggered to check if any new profit levels have been reached, avoiding duplicate notifications. Similarly, the `loss` method handles situations where a signal is losing money, identifying and reporting new loss levels.

Finally, when a signal is closed – whether it hits a take profit, stop loss, or expiration – the `clear` method is used to clean up the signal's data, making sure everything is properly saved and removed from active tracking.

## Interface IOptimizerTemplate

This interface helps you create the building blocks of your backtesting environment by providing templates for various code snippets. It's designed to streamline the generation of code needed for debugging and interacting with Large Language Models (LLMs).

You can use it to generate initial setup code with `getTopBanner`, create user and assistant messages for LLM conversations with `getUserMessage` and `getAssistantMessage`, and build configurations for key components like Walkers, Exchanges, Frames (timeframes), and Strategies. There are also templates for launching your Walkers and generating helper functions for both text and JSON output within your LLM interactions. Essentially, this provides a way to programmatically build parts of your backtesting system.

## Interface IOptimizerStrategy

This interface, `IOptimizerStrategy`, holds all the information used to create a trading strategy using a language model. Think of it as a container for the complete story behind a strategy's creation. It includes the trading symbol the strategy is designed for, a unique name to identify it, and a record of the conversation with the language model that led to its development. Specifically, you'll find the prompts and responses that shaped the strategy's logic, stored within the `messages` property. The `strategy` property itself holds the actual generated strategy description, which represents the core trading instructions.

## Interface IOptimizerSourceFn

The `IOptimizerSourceFn` lets you provide data to the backtest-kit's optimization engine. Think of it as a function that feeds the optimizer with the information it needs to learn and improve. It’s designed to handle large datasets by fetching data in manageable chunks—essentially, it supports pagination. Each piece of data you provide needs to have a unique identifier so the optimizer can keep track of everything.

## Interface IOptimizerSource

This interface, `IOptimizerSource`, helps you define where your backtest data comes from and how it's presented to a language model. Think of it as a recipe for feeding information to the LLM.

You give it a `name` to easily identify the data source, and an optional `note` to provide more context about what the data represents.  The core of it is the `fetch` function, which tells backtest-kit how to retrieve the data, making sure it can handle large datasets through pagination.

To really customize things, you can provide `user` and `assistant` formatters. These are functions that shape the messages sent from the user and the assistant, respectively, allowing you to control exactly how the data is presented for the LLM conversation. If you skip these, it will use pre-built templates.

## Interface IOptimizerSchema

This interface describes the configuration needed to register an optimizer within the backtest-kit framework. Think of it as a blueprint for how your optimizer will work – how it gathers data, crafts trading strategies, and ultimately gets tested.

The `note` field allows you to add a helpful description for your optimizer. `optimizerName` is a crucial unique identifier you'll use to access and manage your optimizer. 

`rangeTrain` specifies multiple time periods for training different versions of your strategy, allowing for comparisons. `rangeTest` defines the period used to evaluate the final, chosen strategy.

`source` is an array of data sources that contribute information to the strategy generation process. The `getPrompt` function is responsible for creating the actual prompt that will be used to generate the trading strategy, drawing from the accumulated information from the data sources.

You can customize certain aspects of the optimizer's behavior using `template`, which overrides default settings. Finally, `callbacks` lets you add custom functions to monitor the optimizer’s progress and lifecycle.

## Interface IOptimizerRange

This interface, `IOptimizerRange`, helps you define specific time periods for backtesting and optimization. Think of it as setting the boundaries for your historical data – when you want your strategy to be evaluated. You'll use it to specify a `startDate` and `endDate`, marking the beginning and end dates for your analysis, inclusive of those dates.  You can also add an optional `note` to provide a description of the time range, like "2023 bear market" or "2024-Q1 bull run".

## Interface IOptimizerParams

This interface defines the core settings needed to set up the backtest-kit's optimization engine. Think of it as the blueprint for configuring how the optimization process will run. It requires a logger to track what's happening during optimization, allowing you to debug and monitor its progress.  It also needs a complete template, which provides all the necessary methods for performing the optimization – this template is built by combining your provided configuration with default settings.

## Interface IOptimizerFilterArgs

This interface defines the information needed to request specific data from a data source. Think of it as a way to tell the system exactly which trading pair and time period you're interested in. You'll specify the `symbol`, like "BTCUSDT", and then clearly define the `startDate` and `endDate` to cover the data you need for backtesting or analysis. It helps narrow down the data retrieval process efficiently.

## Interface IOptimizerFetchArgs

This interface describes the information needed to request data in chunks for optimization. Think of it as telling the system how many records you want in each batch and where to start looking. The `limit` property controls the number of records fetched per request—it's like specifying the page size. The `offset` property determines the starting point, effectively letting you navigate through a large dataset in manageable pieces. You'd use this to efficiently load data for backtesting, without overwhelming the system with too much information at once.

## Interface IOptimizerData

This interface, `IOptimizerData`, is the foundation for providing data to your backtesting optimization process. Think of it as a common structure all your data sources need to follow. Each piece of data you feed into the optimization – whether it’s historical prices, fundamental data, or anything else – *must* have a unique identifier. This `id` property is that unique identifier, and it's incredibly important for preventing duplicates when you're pulling data in chunks or pages.

## Interface IOptimizerCallbacks

This interface lets you listen in on what's happening during the optimization process. You can use these callbacks to keep an eye on things and make sure everything is working as expected.

The `onData` callback is triggered once the optimization framework has gathered all the data needed for your strategies. It's perfect for verifying the data itself or just keeping a record of it.

When the code for your strategies is generated, the `onCode` callback is fired, giving you a chance to log or inspect the code.

If you've configured the framework to save your strategy code to files, the `onDump` callback gets called after each file is written, letting you confirm the save completed successfully.

Finally, `onSourceData` allows you to track the raw data as it’s pulled from your data sources. This is great for validating that the data is being fetched correctly and that the dates are as expected.

## Interface IOptimizer

This interface defines how you interact with the optimization process for your trading strategies. Think of it as a way to get your strategy ideas translated into actual code that can be tested.

You can use `getData` to pull together all the necessary information for a specific trading symbol, preparing the data and building the context needed for strategy generation. The `getCode` method then takes that prepared data and crafts a complete, runnable strategy code block. Finally, `dump` lets you save the generated code directly to a file, automatically creating any needed directories and naming the file appropriately. It's all about transforming your strategy concepts into working code you can use.

## Interface IMethodContext

This interface, `IMethodContext`, acts like a little travel guide for your trading operations within backtest-kit. It carries important information about which specific configurations to use – essentially, which strategy, exchange, and frame you're currently working with. Think of it as a way to automatically know which blueprints to follow during a backtest or live trading session, without having to constantly specify them. It's passed around by the system to ensure everyone’s on the same page regarding the setup being used. The `exchangeName`, `strategyName`, and `frameName` properties tell you exactly which schemas define those components. Notably, `frameName` will be empty when running in live mode, indicating the live trading environment.

## Interface ILogger

The `ILogger` interface provides a way for different parts of the backtest-kit framework – like agents, sessions, or storage – to record information about what's happening. It's like having a central notepad for the system.

You can use the `log` method for important events or changes. The `debug` method is for very detailed information you'd only want to see when you're actively troubleshooting. `info` lets you track successful operations and overall system progress. Finally, `warn` is for noting potential issues that don’t stop the system from working, but should be investigated.

## Interface IHeatmapStatistics

This structure holds the overall picture of your portfolio’s performance, visualized through a heatmap. It gathers statistics across all the assets you're tracking.

You’ll find a list of individual symbol statistics within the `symbols` property, providing details for each asset.  The `totalSymbols` tells you how many assets are included in this overview. 

`portfolioTotalPnl` represents the overall profit or loss generated by your entire portfolio, while `portfolioSharpeRatio` gives you an idea of the risk-adjusted return. Finally, `portfolioTotalTrades` shows the total number of transactions executed across all assets.

## Interface IHeatmapRow

This interface represents a single row of data in a portfolio heatmap, summarizing performance for a specific trading pair like BTCUSDT. It gives you a clear picture of how a particular symbol performed across all your strategies.

You'll find key metrics here, including the total profit or loss percentage, a measure of risk-adjusted return (Sharpe Ratio), and the maximum drawdown, which shows the largest peak-to-trough decline. It also provides details about trade frequency like the total number of trades, wins, and losses.

Furthermore, you can see averages, like the average profit per trade, as well as indicators of consistency and risk management such as standard deviation, profit factor, and streaks of wins or losses. Finally, expectancy, a crucial performance indicator, is also included.

## Interface IFrameSchema

The `IFrameSchema` describes a specific time period and frequency that your backtest will use. Think of it as defining a "window" into your historical data. 

Each schema has a unique name to identify it, and you can add a note to explain what it's for.  You specify the interval—like daily, hourly, or weekly—that your data is structured around, as well as the start and end dates of the backtesting period.  You can also optionally provide lifecycle callbacks to customize how frames are handled. This schema is how you tell backtest-kit *when* and *how* to generate the trading opportunities.

## Interface IFrameParams

The `IFramesParams` interface defines the information needed when you're setting up a ClientFrame, which is a key part of backtest-kit. It essentially bundles together configuration details and a logging tool for keeping track of what’s happening internally.  Specifically, it includes a `logger` property, allowing you to easily send debugging messages and monitor the frame's activity during the backtesting process. This logger helps you understand how the frame is behaving and troubleshoot any issues.

## Interface IFrameCallbacks

This section describes the `IFrameCallbacks` interface, which helps you hook into key events during the generation of timeframes for backtesting. Think of it as a way to observe and potentially adjust the process of creating the timeline your strategies will be tested against.

The most important part is the `onTimeframe` property. This function gets called right after the timeframe array is created. You can use it to examine the generated timeframes – perhaps to ensure they are what you expect, log some details for analysis, or perform any necessary validation steps. It provides you with the timeframe array itself, the start and end dates used for generation, and the interval used to create the timeframes.

## Interface IFrame

The `IFrames` interface helps manage the timelines used for backtesting trading strategies. It’s essentially the backbone for creating the sequences of dates and times that your backtest will run through. 

The key function, `getTimeframe`, allows you to retrieve a specific set of dates and times for a given trading symbol and a defined timeframe. Think of it as generating the "calendar" for your backtest, ensuring that your strategies are tested across the correct time intervals. This function returns a promise that resolves to an array of dates, spaced according to how you’ve configured the timeframe.

## Interface IExecutionContext

The `IExecutionContext` interface provides the necessary information for your trading strategies and exchanges to function correctly. Think of it as a shared container of runtime details. It includes the trading symbol, like "BTCUSDT," the current timestamp representing the point in time for the operation, and a flag indicating whether the code is running in a backtesting simulation or in live trading conditions. This context is automatically passed around by the framework to give your code access to these critical parameters without you having to explicitly manage them.

## Interface IExchangeSchema

This interface describes how backtest-kit interacts with different cryptocurrency exchanges. Think of it as a blueprint for connecting to a specific exchange’s data and rules. 

You're essentially defining how the framework retrieves historical candle data (like open, high, low, close prices) and how it formats trade quantities and prices to match the exchange's standards. 

Each exchange you want to use with backtest-kit needs its own implementation of this interface. It includes a unique identifier for the exchange, an optional note for developers, and functions to fetch candles, format trade sizes, and format prices.  You can also provide callbacks for certain lifecycle events related to candle data.


## Interface IExchangeParams

This interface, `IExchangeParams`, defines the information needed when you're setting up an exchange within the backtest-kit framework. Think of it as the initial configuration for your simulated trading environment. 

It requires a `logger` so you can track what's happening during your backtest and debug any issues.  You’ll also need to provide an `execution` context, which tells the exchange things like which symbol you're trading, the time period you're testing, and whether it's a backtest or live trading. Essentially, it's providing the exchange with the environment it will operate within.

## Interface IExchangeCallbacks

The `IExchangeCallbacks` interface lets you register functions that your backtesting strategy can use to react to incoming data from an exchange. Specifically, it's designed to handle updates about candlestick data. You can provide an `onCandleData` function that will be called whenever new candlestick data becomes available – this includes details like the symbol, the time interval, the starting date, how many candles were requested, and the actual data itself. This allows your strategy to dynamically adjust to market changes as new data arrives.

## Interface IExchange

The `IExchange` interface defines how your backtesting system interacts with an exchange. It lets you grab historical and future candle data, which is essential for simulating trading. You can use it to fetch candles for a specific trading symbol and time interval.

It also provides functions to correctly format trade quantities and prices to match the exchange’s rules, preventing order rejections.

Finally, it calculates the Volume Weighted Average Price (VWAP) based on recent trading activity, which can be useful for evaluating trade execution strategies.

## Interface IEntity

This interface, `IEntity`, serves as the foundation for all data objects that are stored persistently within the backtest-kit framework. Think of it as a common blueprint; any object needing to be saved or retrieved from storage should implement this interface. It ensures a standardized structure for managing and working with your trading data, like historical prices or order information. Implementing this interface is a key step in defining how your data is handled within the system.

## Interface ICandleData

This interface defines the structure for a single candlestick, representing a snapshot of price action and trading volume over a specific time interval. Think of it as a building block for charting or analyzing historical price data. Each candlestick contains essential information: the time it started (timestamp), the opening price, the highest and lowest prices reached during that period, the closing price, and the total volume traded. This data is commonly used when backtesting trading strategies and calculating indicators like VWAP.

## Interface DoneContract

This interface, `DoneContract`, is your signal that a background task – whether it’s a backtest or a live trading execution – has finished running. It gives you key information about what just completed, like which exchange was used, the name of the trading strategy involved, and whether it was a backtest or a real-time live execution.  You’ll find the trading symbol, such as "BTCUSDT", included so you know exactly which asset was being traded. Essentially, it's a notification package telling you when a process is done and provides important context.

## Interface BacktestStatistics

This interface holds all the key statistics calculated during a backtest. It provides a complete picture of how your trading strategy performed.

You'll find a detailed list of every closed trade, including its price, profit and loss, and timestamps, within the `signalList`. The total number of trades executed is tracked in `totalSignals`. 

Key performance indicators like the number of winning and losing trades (`winCount`, `lossCount`) are readily available. From these, important ratios like `winRate` (percentage of winning trades) and `avgPnl` (average profit per trade) are calculated. Overall cumulative profit (`totalPnl`) is also provided.

To understand the risk involved, metrics like `stdDev` (volatility) and the `Sharpe Ratio` (risk-adjusted return) are included, with annualized versions available as well. Finally, the `certaintyRatio` highlights the relationship between average winning and losing trade sizes and `expectedYearlyReturns` gives an estimate of potential annual profit. Note that if any calculation results in an unsafe value (like dividing by zero), the corresponding statistic will be null.
