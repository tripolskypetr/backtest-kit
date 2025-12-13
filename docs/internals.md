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

This function lets you plug in your own logging system for backtest-kit. It's a way to control where and how the framework’s internal messages are displayed. When you provide a custom logger, all log messages will be sent to your implementation, and important details like the strategy name, exchange, and trading symbol will be automatically included to give you more context. You're essentially telling backtest-kit, "Use this logger instead of your default one."

The logger you provide needs to follow the `ILogger` interface, which defines the expected logging methods.

## Function setConfig

This function lets you customize how backtest-kit operates by adjusting its global settings. You provide a configuration object containing the parameters you want to change; it doesn't need to include everything, just the parts you want to modify. A special `_unsafe` flag exists, mainly for testing environments, that allows you to bypass some of the framework’s checks on your configuration. This function is your way to fine-tune backtest-kit to best suit your specific needs.

## Function listWalkers

This function lets you see all the trading strategies, or "walkers," that your backtest-kit framework is currently using. It gives you a list of their configurations, allowing you to inspect them for debugging purposes or to create tools that adapt to the strategies you’ve set up. Think of it as a way to get a full inventory of your trading logic. You can use this information to understand how your backtest is structured or to build interfaces that reflect the active strategies.

## Function listStrategies

This function gives you a way to see all the trading strategies that are currently set up within the backtest-kit framework. It essentially provides a list of all the strategy blueprints you're using. Think of it as a handy tool to check what strategies are available or to build interfaces that display those strategies. You're getting back an array containing information about each registered strategy.


## Function listSizings

This function lets you see all the sizing strategies that are currently active in your backtesting environment. It returns a list of configurations, each describing how position sizes are calculated. Think of it as a way to peek under the hood and understand how your backtest is determining how much to trade. You can use this information to verify your settings or build tools that automatically display these sizing rules. It’s a handy tool for troubleshooting and understanding the sizing logic at play.

## Function listRisks

This function helps you see all the risk configurations your backtest-kit system is using. It's like a quick inventory of all the potential risks you've defined. Think of it as a way to check what's been set up or to build tools that need to know about those risks, such as displaying them to a user. The function returns a list of these risk configurations, allowing you to inspect them programmatically.


## Function listOptimizers

This function lets you see all the optimization strategies currently set up within your backtest kit. It provides a list of details about each optimizer, like its name and configuration. Think of it as a way to check what options are available for automatically tuning your trading strategies. You can use this information to understand your system’s capabilities or to build tools that interact with your optimizers. It’s a handy tool for developers who want a clear view of their optimization setup.

## Function listFrames

This function lets you see all the different types of data structures, or "frames," that your backtesting system is using. Think of it as a way to peek under the hood and understand what kind of information is being processed. It’s really helpful for figuring out how your system works, creating documentation, or building tools that adapt to the specific data formats you're using. The function returns a list describing each frame, so you have a clear picture of their structure and purpose.

## Function listExchanges

This function lets you see a complete list of the exchanges your backtest-kit environment knows about. Think of it as a way to check what trading platforms are currently configured for your simulations. It returns a promise that resolves to an array, with each element describing an exchange – helpful for verifying your setup or building tools that interact with different exchanges. If you’re trying to figure out which exchanges are available or creating a user interface that adapts to the supported platforms, this function is what you need.

## Function listenWalkerProgress

This function lets you keep track of how a backtest is progressing, specifically as each strategy finishes running. It's like setting up a listener that gets notified when a strategy completes its execution within the backtest. 

The function gives you a callback—a piece of code you provide—that gets executed after each strategy finishes. Importantly, even if your callback involves asynchronous operations, the notifications will be processed one after another, guaranteeing order and preventing any potential conflicts. Think of it as a safe way to monitor the backtest's progress step-by-step.

You provide a function (`fn`) which will receive updates about each completed strategy. The function you provide will be called repeatedly as strategies finish during the backtest run.


## Function listenWalkerOnce

This function lets you watch for specific events happening within a trading simulation, but only once. You provide a filter to define what kind of event you're interested in, and a function to execute when that event occurs. After the function runs once, it automatically stops listening, making it perfect for situations where you only need to react to something happening just one time. Think of it as setting up a temporary alert that disappears after it goes off. You give it a condition – like "wait for this specific trade to happen" – and it executes your code and then stops watching.

## Function listenWalkerComplete

This function lets you get notified when a backtest run finishes. It’s useful for actions you need to take after all your strategies have been tested. 

The `fn` you provide will be called with a special object containing the results of the backtest. Importantly, even if your callback function takes some time to complete (like an asynchronous operation), the framework will queue the events to ensure they're processed one after another, keeping things organized.  You can unsubscribe from these notifications at any time by returning the value that the function returns.

## Function listenWalker

This function lets you keep an eye on how your backtest is progressing. It's like setting up a listener that gets notified after each strategy finishes running within the backtest. The listener you provide gets called with details about the completed strategy. 

Crucially, the updates you receive are handled one at a time, even if your listener does some asynchronous work – this ensures things stay in a predictable order. Think of it as a way to monitor the backtest's journey step by step. The function returns an unsubscribe function that you can use to stop listening when you no longer need to.

## Function listenValidation

This function lets you keep an eye on potential problems during your backtesting process. Specifically, it helps you detect and respond to errors that occur when your trading signals are being checked for risk.

Whenever a risk validation error pops up, this function will notify you by calling the function you provide. This is incredibly helpful for finding and fixing issues as they arise. 

The errors are handled one at a time, even if the function you provide takes some time to execute, ensuring a controlled and orderly approach to error handling. Think of it as a safety net for your backtesting, allowing you to address problems as they happen.

## Function listenSignalOnce

This function lets you subscribe to events happening within your trading strategy, but only for a single occurrence. You provide a filter – a rule that determines which events you’re interested in – and a function to execute when a matching event arrives. Once that event is processed, the subscription automatically stops, so you don't have to worry about manually unsubscribing. It's really helpful when you need to react to a specific condition happening just once during your backtest.

It takes two pieces of information: a filter that identifies the events you want to catch, and a function that will be run when a matching event is detected. The function you provide will be executed only once, and then the subscription is automatically cancelled.


## Function listenSignalLiveOnce

This function lets you temporarily listen for specific trading signals coming from a live strategy execution. Think of it as setting up a short-lived listener that only responds to signals that match your criteria. You provide a filter – a way to decide which signals you're interested in – and a function to run when a matching signal arrives. Once that one matching signal triggers your function, the listener automatically turns itself off, so you don’t have to worry about manually unsubscribing. It's useful for quickly reacting to a particular trading opportunity or gathering some data from a live run. 

The filter you provide determines which signals are passed to your callback function. The callback function itself receives the details of the signal that triggered it.

## Function listenSignalLive

This function lets you set up a listener to receive real-time trading signals generated by your backtest or live execution. Think of it as plugging into a stream of updates from your strategy. 

It's specifically designed for signals coming from `Live.run()` executions, meaning it works with live trading scenarios.

When a new signal arrives, the provided function (`fn`) will be called with information about that signal, ensuring they’re handled in the order they come in. The function returns an unsubscribe function, allowing you to easily stop listening to the signals when you no longer need them.

## Function listenSignalBacktestOnce

This function lets you set up a listener that will react to signals generated during a backtest, but only once. You provide a filter to specify which signals you’re interested in, and a function to execute when a matching signal appears. The listener will automatically stop after running your function once, so you don't have to worry about manually unsubscribing. It’s ideal for situations where you only need to perform a single action based on a specific event during the backtest process. 

The filter function determines which events are passed to your callback. The callback function then handles the relevant signal.

## Function listenSignalBacktest

This function lets you tap into the backtest process and react to events as they happen. Think of it as setting up a listener that gets notified whenever a signal is generated during a backtest run. 

It works by providing a callback function – anything you want to do when a signal appears, you put inside that function. The signals are delivered one after another, ensuring that you process them in the order they occurred during the backtest. 

This listener only receives signals from backtests initiated with `Backtest.run()`. It’s a handy way to monitor what's happening behind the scenes and build custom logic based on those signals. You'll get back a function that can unsubscribe you from the listener when you no longer need it.

## Function listenSignal

This function lets you set up a listener to be notified whenever your trading strategy produces a signal, like when it decides to buy, sell, or hold. The listener will receive updates on different signal states - idle, opened, active, and closed – giving you a complete picture of what's happening. Importantly, these updates are processed one at a time, even if your listener needs to do some asynchronous work; this ensures things happen in the order they're received and prevents any unexpected conflicts. You provide a function that will be called with each signal event. When you're done listening, the function returns another function you can call to unsubscribe.

## Function listenRiskOnce

This function lets you react to specific risk-related events, but only once. Think of it as setting up a temporary listener that triggers a function when a particular condition is met. It’s perfect for situations where you need to wait for a certain risk event to occur and then take action, after which you don’t need to keep listening. 

You provide a filter to define the events you're interested in, and a function to execute when that event happens. Once the event matches your filter, your function runs, and the listener automatically stops, preventing further callbacks. 

The filter helps you pinpoint exactly which risk events should trigger your action, while the callback function handles the specific logic you want to run.

## Function listenRisk

This function lets you be notified when a trading signal is blocked because it violates your defined risk rules. It’s like setting up a listener that only rings when something goes wrong with your risk management.

You provide a function that will be called whenever a signal is rejected due to a risk check failing. Importantly, you won't receive notifications for signals that *are* allowed – this prevents unnecessary calls and keeps things efficient. 

The events are handled in the order they arrive, even if your callback function performs asynchronous operations. A queuing mechanism ensures your callback runs one at a time, avoiding any potential conflicts.


## Function listenPerformance

This function lets you keep an eye on how quickly your trading strategies are running. It's like setting up a listener that gets notified whenever a performance metric changes during your strategy's execution. You provide a function that will be called with these performance updates, allowing you to profile your code and pinpoint any slow spots. Importantly, the updates are handled one at a time, even if your callback function itself takes some time to process, ensuring a consistent flow of information. This helps prevent your performance monitoring from interfering with the actual trading process.

## Function listenPartialProfitOnce

This function lets you react to specific partial profit events, but only once. You provide a filter that defines which events you're interested in, and a callback function that will be executed when a matching event occurs. Once the callback has run, the subscription is automatically cancelled, ensuring you don't get triggered repeatedly. It’s a convenient way to handle events that require a one-time response to a profit condition.

You tell it what kind of partial profit events you want to watch for using a filter function. 
Then, you provide a function that will be called just once when an event matches that filter. 
After that single execution, the function stops listening.

## Function listenPartialProfit

This function lets you be notified when your trading strategy hits certain profit milestones, like reaching 10%, 20%, or 30% profit. It’s designed to handle these notifications in a reliable way – even if your notification code takes some time to run. The notifications will arrive one after another, in the order they happen, ensuring you don't miss anything. You provide a function that will be called each time a profit milestone is reached, and this function will receive information about the event.

## Function listenPartialLossOnce

This function lets you react to specific partial loss events just once and then automatically stop listening. Think of it as setting up a temporary alert—you tell it what kind of loss event you're looking for, it triggers your code when it sees it, and then it quietly stops checking. It's perfect for situations where you only need to respond to a particular loss condition a single time, like maybe running a specific action when a loss level is breached. You provide a filter to identify the event you want, and a function to execute when that event occurs.

## Function listenPartialLoss

This function lets you keep track of when your trading strategy hits certain loss levels, like losing 10%, 20%, or 30% of its initial capital. You provide a function that will be called whenever a partial loss milestone is reached. 

The framework takes care of handling these events in a specific order, even if the function you provide takes some time to execute. This ensures that your strategy reacts to loss levels reliably and without potential issues from running things out of order. You’re essentially signing up to be notified about significant loss points in your backtest.

## Function listenOptimizerProgress

This function lets you keep an eye on how your optimizer is doing as it runs. It provides updates during the optimization process, showing you the progress of data source processing. These updates happen in the order they’re received, and even if your update handling involves asynchronous operations, they’re processed one at a time to ensure smooth tracking. You simply provide a function that will be called with progress information, and this function returns another function that you can use to unsubscribe from the updates later.

## Function listenExit

This function allows you to be notified when the backtest-kit framework encounters a serious, unrecoverable error that halts its operations – things like issues within background processes. Think of it as a safety net for critical failures in your backtesting. It’s different from listening for regular errors because these fatal errors completely stop the ongoing process. The errors are handled one at a time, even if your error handling code involves asynchronous operations. It ensures that error handling occurs in a controlled and sequential manner, preventing potential conflicts. To use it, you provide a function that will be called with the error details whenever a fatal error occurs.

## Function listenError

This function allows your strategy to react to errors that happen during its execution, but aren't critical enough to stop the whole process. Think of it as a way to catch and deal with temporary issues, like a failed API request. 

It sets up a listener that will notify your strategy whenever a recoverable error occurs.  The error information is passed to a callback function that you provide.

Importantly, these errors are handled one at a time, in the order they happen, even if the function you provide to handle them takes some time to complete. This ensures a predictable and stable strategy behavior.


## Function listenDoneWalkerOnce

This function lets you set up a listener that's only triggered once when a background task finishes, but only for specific types of completion events. You provide a filter function that determines which completion events you’re interested in, and then you give it a callback function that will run once when a matching event occurs.  Once the callback runs, the listener automatically stops listening, so you don’t need to worry about manually unsubscribing. It's perfect for situations where you only need to react to a completion event once and then move on.

## Function listenDoneWalker

This function lets you track when background processes within the backtest-kit framework finish running. It’s useful if you need to perform actions after a specific task completes, ensuring they happen in a controlled and sequential order. 

You provide a callback function that will be executed when a background process is done. Importantly, even if your callback function involves asynchronous operations, they're handled in a way that prevents multiple callbacks from running at the same time, maintaining order and stability. The function returns another function that you can call to unsubscribe from these completion events.

## Function listenDoneLiveOnce

This function lets you react to when a background task finishes running within your backtest. Think of it as setting up a single, temporary listener. 

You provide a filter – a test – to decide which finished tasks you want to be notified about, and then a function to execute when a matching task completes.

Once that callback runs, the listener automatically disappears, so you don't have to worry about cleaning it up yourself. It’s a neat way to handle specific completion events just once.


## Function listenDoneLive

This function lets you keep track of when background tasks within your backtest finish running. It's a way to be notified when a task completes, ensuring that events are handled one after another, even if your notification code takes some time to execute. You provide a function that gets called when a background task is done, and this function returns another function that you can use to unsubscribe from these completion notifications.

## Function listenDoneBacktestOnce

This function lets you react to when a backtest finishes running in the background, but with a twist – it only responds once. You provide a filter to specify which backtest completions you're interested in, and then a function that will be executed when a matching backtest is done.  After that function runs once, the subscription is automatically removed, so you won't get any further notifications. It’s a convenient way to do something briefly when a specific backtest concludes without cluttering your code with ongoing subscriptions. 

The first argument, `filterFn`, acts as a gatekeeper, deciding if the event is relevant. The second, `fn`, is the code you want to run when a relevant backtest completes.

## Function listenDoneBacktest

This function lets you tap into when a backtest finishes running in the background. It’s useful if you need to perform actions after the backtest is complete, like updating a user interface or saving results.

Essentially, you provide a function (`fn`) that will be called when the backtest is done.  The function receives an event object containing details about the completed backtest.

Importantly, the system ensures that your provided function is always executed one after another, even if it involves asynchronous operations, preventing any potential conflicts. This provides a reliable way to react to backtest completion.

## Function listenBacktestProgress

This function lets you keep an eye on how your backtest is running. It's like setting up a listener that gets notified as the backtest progresses, especially useful when you're running tasks in the background. The updates you receive will come one after another, even if the function you provide to handle those updates takes some time to complete. This ensures a controlled flow of information and prevents any potential issues from simultaneous operations. You provide a function that will be called with progress information during the backtest’s background processing.

## Function getMode

This function lets you check whether your trading strategy is running in backtest mode, simulating past data, or in live trading mode, interacting with real markets. It returns a simple value: either "backtest" or "live", clearly indicating the current operational state. This is useful for conditional logic within your strategy, allowing you to adjust behavior depending on whether you’re testing or actively trading. Think of it as a quick way to check if you’re in practice or in the game.

## Function getDefaultConfig

This function gives you the standard settings used by the backtest-kit framework. It's a great way to see all the configuration options that are available and what their initial, preset values are. Think of it as a template for how the system is normally set up.

## Function getDate

This function, `getDate`, is your way to retrieve the current date within your trading strategy. It's useful for time-sensitive calculations or logic. When running a backtest, it will give you the date associated with the specific timeframe the strategy is analyzing. If you're running live, it provides the actual, current date and time. Essentially, it helps your code be aware of the "when" of its actions.

## Function getConfig

This function lets you peek at the framework’s settings. It provides a snapshot of all the global configuration values, like retry counts, slippage percentages, and signal lifetime limits. Importantly, it gives you a copy, so changing the returned value won't actually change the core settings of the backtest kit. Think of it as a read-only window into how the framework is currently set up.

## Function getCandles

This function allows you to retrieve historical price data, specifically candles, for a given trading pair. Think of it as pulling up a chart of past prices. 

You tell it which trading pair you're interested in – like "BTCUSDT" for Bitcoin against USDT – and how often you want the data – for example, every minute ("1m") or every hour ("1h"). You also specify how many candles, or data points, you want to retrieve. 

The function then connects to the exchange you're using and fetches that historical data, returning it to you in a structured format. It uses the underlying exchange's method for getting candles, so it’s relying on the exchange's capabilities.

## Function getAveragePrice

The `getAveragePrice` function helps you figure out the average price of a trading pair, like BTCUSDT. It does this by looking at the last few minutes of trading data and calculating a Volume Weighted Average Price, or VWAP. Essentially, it gives more weight to prices where more trading activity occurred. If there's no trading volume to consider, it will simply average the closing prices instead. To use it, you just need to provide the symbol of the trading pair you're interested in.

## Function formatQuantity

This function helps you prepare trade quantities in a way that's compatible with the specific exchange you’re using. It takes a trading symbol, like "BTCUSDT", and the raw quantity you want to trade. It then uses the exchange's rules to format that quantity, ensuring the correct number of decimal places are applied, which is crucial for successful order placement. Think of it as automatically handling the exchange’s formatting requirements for you.

## Function formatPrice

This function helps you display prices correctly for different trading pairs. It takes a symbol like "BTCUSDT" and a raw price as input. 

It then formats the price according to the specific rules of that exchange, ensuring the right number of decimal places are shown. Think of it as automatically handling the price formatting for you, based on the trading pair.



The function returns a string representing the formatted price.

## Function dumpSignal

This function helps you save detailed records of your AI-powered trading strategy's decisions. It takes the conversation history with the language model, the resulting trading signal (like entry price, take profit, stop loss), and creates a set of markdown files that explain exactly what happened.

Think of it as creating a debug log for your AI. These files neatly organize the system prompts, user messages, and the final output from the language model, all tied to a unique identifier.

You can specify where these files are saved, or it will default to a "dump/strategy" folder. Importantly, it won't overwrite any existing files, preserving your previous analysis. The unique identifier (signalId) helps you easily locate and review specific trading decisions.


## Function addWalker

This function lets you register a "walker" which is essentially a way to run multiple backtests at once and compare how different strategies perform against each other. Think of it as setting up a standardized environment to see which strategies are strongest. You provide a configuration object that tells the walker how to run these comparisons, defining things like the data to use and the metric for evaluation. By registering a walker, you’re integrating this comparison process into the backtest-kit framework.

## Function addStrategy

This function lets you add a trading strategy to the backtest-kit framework. Think of it as registering your strategy so the system knows about it and can run it. When you add a strategy this way, the framework automatically checks to make sure your strategy's signals are valid, prevents it from sending too many signals at once, and ensures it can safely save its progress even if something unexpected happens during a live test. You’ll provide a configuration object that defines your strategy's logic and parameters when you call this function.

## Function addSizing

This function lets you tell the backtest-kit how to determine the size of your trades. You're essentially defining a strategy for how much capital to allocate to each position based on factors like your risk tolerance and the volatility of the asset. 

You’re providing a configuration object that outlines your sizing method, such as using a fixed percentage of your capital, a Kelly Criterion approach, or sizing based on Average True Range (ATR). 

The schema also lets you set limits on your position sizes, ensuring you don’t take on too much risk. Finally, it includes a callback function that lets you react to sizing calculation events within your backtest.

## Function addRisk

This function lets you set up how your trading framework manages risk. Think of it as defining the guardrails for your strategies – it dictates things like the maximum number of trades you can have running at once. 

You can also create more complex risk checks here, going beyond simple limits and factoring in things like portfolio balance or how different strategies affect each other. 

The framework keeps track of all active trades, and this lets multiple trading strategies share the same risk controls, promoting a more holistic view of your overall risk exposure. Essentially, it’s how you tell the system what level of risk you're comfortable with. The `riskSchema` parameter is the blueprint for these rules.

## Function addOptimizer

This function lets you tell the backtest-kit framework about a specific optimizer you want to use. Think of an optimizer as a recipe for creating trading strategies—it takes data, combines it with large language models, and turns it into runnable code. You provide a configuration object that outlines how this optimizer works, detailing things like how it collects data and generates prompts. The result is a fully formed JavaScript file ready to be used for backtesting.

## Function addFrame

This function lets you tell backtest-kit how to generate the different timeframes you’ll be using in your backtesting simulations. Think of it as defining the "schedule" for your data. 

You provide a configuration object that specifies things like the start and end dates of your backtest, the interval (e.g., 1-minute, 1-hour, daily), and a way for the framework to notify you when new timeframes are ready. Essentially, it's how you tailor the timeframe generation to your specific needs. The `frameSchema` object holds all of this information.

## Function addExchange

This function lets you tell backtest-kit about a new data source for trading, like a cryptocurrency exchange or stock market. Think of it as adding a new place where your trading strategies can get historical price data. You provide a configuration object that defines how to access and format the data from that exchange. This setup allows the framework to fetch the historical candles, understand how prices and quantities are represented, and even calculate things like VWAP (volume-weighted average price) for your analysis. It's a crucial step to get your backtesting environment connected to the real-world data it needs.

# backtest-kit classes

## Class WalkerValidationService

This service helps you keep track of and verify your parameter sweep configurations, which are essential for optimization and hyperparameter tuning. Think of it as a central place to manage all your different experiment setups.

It allows you to register new experiment configurations, making sure they exist before you try to run them. To make things efficient, it remembers validation results so you don't have to repeat checks unnecessarily.

You can use it to add new experiment setups, confirm that a specific setup is valid, and get a complete list of all your defined setups. This service is designed to prevent errors and speed up your optimization process.


## Class WalkerUtils

WalkerUtils provides helpful tools for working with walkers, which are essentially automated trading strategies. It simplifies the process of running and managing these strategies, especially when you want to compare different approaches.

Think of it as a central place to start walkers, get their results, and stop them when needed. It automatically handles some of the behind-the-scenes details, such as figuring out which exchange and timeframe to use.

You can easily run a walker comparison for a specific trading symbol, execute them in the background without needing to see the detailed progress, or get a complete report summarizing the results in a readable format.  It also allows you to stop walkers, ensuring they don’t generate new trading signals.

Finally, you can use WalkerUtils to see a list of all currently running walker instances and their status. This class is designed to be used everywhere by providing a single instance.

## Class WalkerSchemaService

The WalkerSchemaService helps you keep track of different trading strategies, or "walkers," and their configurations. Think of it as a central place to store and manage the blueprints for your trading logic.

It uses a special type-safe system to ensure your configurations are consistent and accurate. You add new walker schemas using `addWalker()`, and then retrieve them later by name using `get()`. 

Before a new strategy is added, the `validateShallow()` method checks if it has all the necessary components.  If a walker already exists, you can update parts of it with `override()`. The service also keeps a record of any errors that occur using `loggerService`.

## Class WalkerMarkdownService

This service helps you create reports about your trading strategies, specifically focusing on how they perform during backtesting. It listens for updates from the backtesting process, gathers performance data for each strategy, and then organizes this information into nicely formatted markdown tables. 

Each backtesting run (or “walker”) gets its own dedicated space to store its results, ensuring data stays separate. You can request the accumulated data for a specific strategy or generate a full report comparing multiple strategies. The reports are saved automatically to disk as markdown files, making them easy to read and share.  

To start using the service, no explicit setup is needed; it automatically initializes when you first request data.  You can also clear the data for a specific backtesting run or all runs if needed.

## Class WalkerLogicPublicService

WalkerLogicPublicService helps you orchestrate and run your trading strategies by automatically managing important information like the strategy name, exchange, frame, and walker. Think of it as a convenient wrapper around the core logic, making it easier to execute your backtests.

It uses a logger service, a private service for the core walker logic, and a schema service to ensure everything runs smoothly. 

The `run` method is the main way you'll interact with this service; it lets you specify a symbol and context (like the walker's name, exchange, and frame) to execute the backtesting process. Essentially, it handles the details of running your strategies and passing the necessary information along.

## Class WalkerLogicPrivateService

This service handles orchestrating comparisons between different trading strategies, often called walkers. Think of it as a conductor managing a group of musicians (strategies) to see which one performs best. 

It works by running each strategy one after another, providing updates on the progress of each one as it finishes. During this process, it keeps track of the best-performing strategy based on a specified metric. 

Finally, it returns a complete report showing how all the strategies ranked against each other. It relies on other services internally to handle the actual backtesting and markdown generation.

The `run` method is the primary way to use this service. You give it a symbol, a list of strategies to compare, a metric to evaluate them by, and some context information like the exchange and frame names. The method then returns a stream of results, giving you updates as each strategy completes its test.

## Class WalkerCommandService

WalkerCommandService acts as a central point for interacting with the walker functionality within the backtest-kit framework. Think of it as a convenient layer on top of the underlying logic, designed to make it easier to use in different parts of your application through dependency injection.

It brings together several important services like those for logging, handling walker logic, validating strategies and exchanges, and managing schemas. This centralizes access to these components.

The key function, `run`, lets you execute a walker comparison for a specific trading symbol.  When you call `run`, you need to specify the symbol you’re interested in, along with context details like the names of the walker, exchange, and frame you’re using.  The result of running the walker is provided as a sequence of results.


## Class StrategyValidationService

The StrategyValidationService helps keep track of your trading strategies and make sure they're set up correctly. It acts as a central place to register your strategies, ensuring that each one exists and has a valid associated risk profile, if one is required. 

You can add new strategies using `addStrategy`, and it remembers which strategies you've registered using `list`.  The `validate` function checks if a strategy exists and its risk profile is valid, and it's optimized to avoid repeated checks thanks to memoization.  Essentially, this service helps streamline your strategy management and catches potential issues early on.

## Class StrategySchemaService

The StrategySchemaService helps you keep track of your trading strategies and their configurations in a structured and type-safe way. Think of it as a central place to store and manage the blueprints for your strategies.

It uses a registry to hold these blueprints, and it’s designed to make sure your strategies are well-formed before they'll be accepted.

You can add new strategies using `addStrategy()` (represented by the `register` property) and get them back later by their name using `get()`. If you need to make small changes to an existing strategy, you can use `override()` to update just the parts you need. `validateShallow` performs a quick check to ensure a new strategy has the essential properties before it’s saved.

## Class StrategyCoreService

StrategyCoreService acts as a central hub for managing and executing strategies within the backtest-kit framework. It combines several services – including handling connections, schema validation, and risk assessment – to streamline the process.

It keeps track of validations to avoid unnecessary repetition, and provides tools for monitoring signals, checking strategy status (like if it's been stopped), and running quick backtests using historical data. You can also use it to halt a strategy's signal generation or clear its cached data, forcing a fresh start. Essentially, it’s a facilitator that prepares and manages strategies for execution, always with an eye on performance and reliability.

## Class StrategyConnectionService

This service acts as a central hub for managing and running your trading strategies. It automatically connects your strategies to the correct data streams and handles the complexities of running them, whether you're doing live trading or backtesting.

Think of it as a smart router that makes sure the right strategy gets the right data. It keeps track of your strategies and reuses them whenever possible to save on resources and speed things up.

Before you can actually trade or backtest, this service makes sure everything is properly initialized. It also provides ways to check the status of a strategy, retrieve pending signals, and even stop a strategy from generating new trades. If you need to refresh a strategy's state or free up resources, there's a way to clear its cached information and force it to reload.

## Class SizingValidationService

The SizingValidationService helps you keep track of your position sizing strategies and ensures they’re set up correctly. Think of it as a central hub for managing how you determine the size of your trades.

You can add new sizing strategies using `addSizing`, effectively registering them with the service. Before you actually use a sizing strategy in your backtesting, `validate` checks to make sure it's been registered, preventing errors down the line. The service also remembers its validation results to speed things up. 

Finally, `list` provides you with a simple way to see all the sizing strategies you’ve registered.

## Class SizingSchemaService

This service helps you organize and manage your sizing schemas – think of them as blueprints for how much to trade. It uses a safe and structured way to store these schemas, ensuring consistency in your backtesting.

You can add new sizing schemas using `register`, which essentially adds a new blueprint to the system. If you need to tweak an existing sizing schema, `override` lets you make partial updates without replacing the whole thing.  Need to recall a sizing schema? `get` will retrieve it by its name.

The system also checks your sizing schemas for basic structural correctness before letting you register them, ensuring they have the essential components and types.  It uses a `LoggerService` to keep track of what's happening, providing helpful messages as you manage your sizing schemas.

## Class SizingGlobalService

The SizingGlobalService is a central component responsible for determining how much of an asset to trade. It acts as a bridge, using a connection service to perform the actual size calculations and also includes validation steps to ensure the sizing is appropriate. Think of it as the brains behind the trading size, coordinating everything needed to figure out the right amount to buy or sell.

It internally manages logging, the connection to the sizing engine, and validation of sizing parameters.

The main function `calculate` is how you’d request a size: you provide details about the trade and the system provides the position size.


## Class SizingConnectionService

The SizingConnectionService helps your trading strategies determine how much to trade by connecting to the right sizing method. Think of it as a traffic controller, directing size calculations to the specific implementation you're using, whether it’s a fixed percentage, Kelly Criterion, or something else.

It remembers which sizing methods you’re using (memoization) so it doesn't have to recreate them every time, making things faster. When you need a sizing method, you specify its name, and the service handles the rest, making sure the right calculations are performed.  If your strategy doesn’t use any sizing, you can simply leave the sizing name blank.

The service uses a `sizingName` to route sizing requests and provides a way to clear or control the memoized sizing instances, enabling you to manage the caching behavior. You provide parameters and a context, and the service calculates the position size based on your risk parameters and the selected sizing method.

## Class ScheduleUtils

ScheduleUtils is a helpful tool that simplifies working with scheduled trading signals. It acts as a central place to track and understand how your signals are being processed. 

You can use it to get detailed statistics about signals for a specific trading symbol and strategy, like how many signals are waiting or getting cancelled. It also automatically creates easy-to-read markdown reports summarizing signal activity.

Want to keep an eye on things? The `dump` function allows you to save those reports directly to a file for later review. Think of it as a built-in reporting system for your scheduled trading operations.

## Class ScheduleMarkdownService

This service helps you automatically generate and save reports about scheduled signals, which are essential for tracking your trading strategy's performance. It keeps an eye on when signals are scheduled and cancelled, organizing the information by strategy and the symbol being traded.

The service creates easy-to-read markdown tables summarizing these events, and it also provides useful statistics like cancellation rates and average wait times. These reports are automatically saved to your logs directory, making it simple to review your strategy's behavior over time.

To get started, the service automatically subscribes to signal events when it's first used. You can then request reports for specific strategies and symbols, or clear the accumulated data if needed. The service uses a storage mechanism that keeps data separate for each combination of symbol and strategy, ensuring organized reporting.

## Class RiskValidationService

The RiskValidationService helps you keep track of and verify your risk management settings. Think of it as a central place to register your risk profiles and make sure they're all properly defined before you start trading. 

It lets you add new risk profiles using `addRisk`, and it provides a `validate` function to double-check that a profile actually exists before you try to use it. To avoid unnecessary checks, the service intelligently caches validation results for quick access. 

If you need a complete overview of all your registered risk profiles, the `list` function provides a simple way to retrieve them. The service also uses a logger to help you debug any issues.

## Class RiskUtils

The RiskUtils class helps you understand and report on risk rejections within your backtesting system. Think of it as a tool to analyze why trades were rejected and see the overall picture of risk management.

It provides a simple way to get statistical summaries of rejections, like how many times rejections occurred for a particular symbol or strategy. You can also generate detailed markdown reports that clearly present each rejection event in a table format, including the reason for rejection, the price at the time, and the number of active positions.  

Finally, it allows you to save these reports directly to files on your disk, automatically creating the necessary directories, so you can easily share or archive your risk rejection data. It pulls its information from the RiskMarkdownService, which keeps track of risk rejection events.

## Class RiskSchemaService

This service helps you keep track of your risk schemas in a safe and organized way. It acts as a central place to store and manage these schemas, ensuring they're consistent and reliable.

You can add new risk profiles using the `addRisk()` method (represented by `register` in the code), and easily retrieve them later by their assigned name with the `get()` method.  If you need to update an existing schema, the `override()` method lets you make partial changes. Before a new schema is added, `validateShallow()` checks its basic structure to make sure it’s set up correctly.  Behind the scenes, it uses a type-safe registry to keep everything in order and a logger to keep track of what's happening.

## Class RiskMarkdownService

The RiskMarkdownService helps you keep track of and document rejected trades due to risk management rules. It automatically listens for risk rejection events and organizes them by the trading symbol and strategy being used.

You can think of it as a reporting system: it gathers all the rejection details, turns them into easy-to-read markdown tables, and provides overall statistics about how often rejections are happening. These reports are saved to your disk, making it simple to review your risk management effectiveness.

The service offers several helpful functions. You can retrieve detailed statistics, generate full markdown reports, save reports to disk, and even clear out all the accumulated data if needed. It handles the data organization and reporting for you, allowing you to focus on analyzing and improving your trading strategies and risk controls. The service initializes automatically when you first use it, so you don't need to configure anything upfront.

## Class RiskGlobalService

The RiskGlobalService acts as a central hub for managing risk-related operations within the trading framework. It essentially sits on top of the RiskConnectionService, handling the important task of checking if trading actions align with defined risk limits.

It keeps track of signals – essentially, indications to buy or sell – ensuring they adhere to the set rules. This service also has memory; it avoids repeatedly validating the same risk settings to boost efficiency. 

You can think of it as a gatekeeper, logging and managing signals as they're opened or closed. It offers a way to clear out all risk data or selectively clear data for a specific risk instance, which helps with maintenance and resetting the system. 

It uses a loggerService to record activity, and relies on a riskConnectionService to interact with the risk management system, with a riskValidationService handling the actual risk checks.

## Class RiskConnectionService

The RiskConnectionService acts as a central hub for managing risk checks within your trading system. It intelligently directs risk-related operations to the correct risk implementation based on a given name, ensuring your strategies adhere to predefined limits. To improve performance, it keeps a record of these risk implementations, reusing them when possible.

You can use `getRisk` to obtain a risk implementation; the first time you request a specific risk implementation, it's created, and subsequent requests simply retrieve the existing, cached version.

The `checkSignal` method is crucial for ensuring signals are permissible according to your risk rules. It performs validations like drawdown, exposure, and loss limits and will notify your system if a signal is rejected. 

Signals are registered and unregistered with the risk management system through `addSignal` and `removeSignal` respectively.

Finally, `clear` allows you to manually refresh the cached risk implementations, useful for scenarios like configuration changes. If no risk name is provided, it clears all cached implementations.

## Class PositionSizeUtils

This class offers helpful tools for figuring out how much of an asset to trade, based on different strategies. It’s like having a calculator for position sizing.

You can use it to calculate position sizes using methods like a fixed percentage of your account, the Kelly Criterion (which aims to maximize growth), or based on the Average True Range (ATR) to account for volatility.

Each method included checks to make sure the inputs you provide are appropriate for the sizing approach you’re using. The calculations consider things like your account balance, the asset’s price, and other relevant factors to help determine the right size for your trade.

## Class PersistSignalUtils

This class, PersistSignalUtils, helps manage how trading signals are saved and restored, ensuring data isn't lost even if something goes wrong. It acts like a central hub for handling signal persistence, particularly used by the ClientStrategy in live trading environments. 

Think of it as a memory system for your trading strategies – it remembers the signals they generated and can recall them later. It does this smartly, using a cached storage system per strategy and providing a way to use custom storage methods if needed.

The class also ensures that saving and loading signal data is done safely. Writes are atomic, meaning they happen as a single, indivisible operation, which is crucial to prevent data corruption in case of crashes. It provides functions to read the saved signal data and write new data, always keeping things consistent. Finally, it allows you to plug in your own persistence solutions if the default behavior isn’t quite what you need.

## Class PersistScheduleUtils

This utility class, PersistScheduleUtils, helps manage how scheduled signals are saved and loaded for your trading strategies. Think of it as a reliable memory for your strategy's planned actions. 

It automatically handles storing these signals so they don't get lost, even if something goes wrong. You can customize how this storage works by plugging in your own adapters, allowing for flexibility in where and how the data is persisted. 

The `readScheduleData` method is used to retrieve previously saved signals, while `writeScheduleData` saves the current state of your scheduled signals safely to disk, ensuring data integrity. This is especially important for strategies operating in live mode, as it prevents the loss of valuable planned actions.

## Class PersistRiskUtils

This class helps manage and save your active trading positions, particularly when using a specific risk profile. It keeps track of positions in a way that's efficient and safe, even if your system crashes unexpectedly.

The class uses a clever system to remember where your data is stored, and allows you to plug in your own storage solutions if needed. It safely reads in existing positions when your system starts up and saves changes as they happen, ensuring data integrity. 

When you're adding or removing trading signals, this class takes care of saving the updated position information to disk. It makes sure these saves are done in a way that protects your data from being corrupted, which is crucial for reliable backtesting and live trading. You can even customize how data is stored using a persistence adapter.

## Class PersistPartialUtils

This class, PersistPartialUtils, helps manage how partial profit and loss data is saved and loaded, particularly for live trading. It's designed to be reliable, even if your application crashes unexpectedly.

It automatically handles storing different data sets for each trading symbol, and allows you to plug in your own methods for saving data if you want something beyond the default. 

When your application starts, it retrieves any previously saved partial data to ensure you pick up where you left off. After profit or loss levels change, this class takes care of writing the updated data to disk in a way that prevents data loss due to crashes. 

You can even tell it to use a specific type of storage mechanism if the built-in options aren’t what you need.

## Class PerformanceMarkdownService

This service helps you understand how your trading strategies are performing by collecting and analyzing data. It keeps track of metrics for each strategy you use, calculating things like average returns, minimum losses, and percentile values.

You can use it to generate easy-to-read markdown reports that highlight potential bottlenecks in your strategies. These reports are saved to your logs directory, making it simple to review performance over time.

The service uses a system of isolated storage to keep data separate for each symbol and strategy combination, so you don’t mix up results. It’s designed to be initialized only once, making sure it's ready to track performance from the start. Finally, you can clear the stored data when you want to start fresh or reset your analysis.

## Class Performance

The Performance class helps you understand how well your trading strategies are performing. It provides tools to collect and analyze performance data, allowing you to identify areas for improvement.

You can use `getData` to retrieve aggregated statistics for a specific trading symbol and strategy, giving you insights into metrics like duration, average times, and volatility. 

`getReport` generates a comprehensive markdown report that visualizes performance, including how time is spent across different operations and detailed statistics. This helps pinpoint bottlenecks and understand overall efficiency.

Finally, `dump` allows you to save these reports to a file, making it easy to track progress over time and share your findings. The reports are saved as markdown files, and you can customize the file path.

## Class PartialUtils

This class helps you analyze and report on partial profit and loss events, like those from backtesting or live trading. It acts as a central point to access and organize data collected about your trades.

You can use it to get statistical summaries of your partial profit/loss events, for a specific symbol and strategy.  It also allows you to create nicely formatted markdown reports showing all the partial profit/loss events for a given symbol and strategy, presenting them in a clear table with details like action, symbol, signal ID, position, level, price, and timestamp. Finally, you can easily save these reports to a file on your disk in a standard markdown format, making them simple to share or review. The class automatically handles creating the necessary directories if they don’t already exist.

## Class PartialMarkdownService

This service helps you track and report on your partial profits and losses. It listens for events related to gains and losses, organizing them by the trading symbol and strategy being used. It then creates nicely formatted markdown reports detailing these events. 

You can easily retrieve overall statistics, generate reports for specific symbol-strategy combinations, and save those reports as files.  The service automatically handles organizing the data and creating the reports, making it simpler to analyze your trading performance.  It also includes a convenient way to clear out the accumulated data when needed, and it initializes itself automatically when you start using it.

## Class PartialGlobalService

The PartialGlobalService acts as a central hub for managing and tracking partial profit and loss information within the backtesting framework. Think of it as a middleman – it receives requests related to profits, losses, and clearing those states, logs these operations for monitoring purposes, and then passes them on to the underlying PartialConnectionService to actually handle them.

It's designed to be injected into your trading strategy, providing a consistent and controlled way to manage partial state changes.  It helps ensure that your strategies interact with the partial profit/loss tracking system in a predictable manner, and gives you valuable logs to understand what’s happening behind the scenes.

Key components are injected from the dependency injection container, including services for logging, handling connections, validating strategy configurations, and retrieving schema information. The `validate` function efficiently checks strategy and risk configurations, preventing unnecessary checks. The `profit`, `loss`, and `clear` methods handle the core actions of tracking these states, logging them globally before forwarding to the connection layer.

## Class PartialConnectionService

The PartialConnectionService manages how your trading system tracks partial profits and losses for each individual signal. Think of it as a central hub that keeps track of these partial states and ensures they're handled correctly.

It creates and maintains a record, called a ClientPartial, for each signal you’re tracking. This record stores information about the signal's profit/loss and is cached for efficiency – it only creates a new one when needed.

When a signal reaches a profit or loss threshold, the service handles the calculations and sends out notifications. When a signal closes, it cleans up the record, releasing resources. This prevents your system from accumulating unnecessary data and helps keep things running smoothly.

The service is integrated into your overall trading strategy, and it uses a caching mechanism to be fast and efficient. It's designed to keep track of the crucial details of your signals without bogging down the rest of your system.

## Class OutlineMarkdownService

This service helps create readable documentation files from the results of AI-powered trading strategies. It’s particularly useful when the AI strategy optimizer is generating logs and conversation history.

The service automatically organizes these results into a structured directory, making it easier to review and debug the AI's decision-making process. You’ll find system prompts, user inputs, and the final AI output saved as separate markdown files within a directory named after the strategy’s signal ID.

The service is designed to be cautious; it won't overwrite existing documentation files, ensuring that previous results are preserved. It relies on a logger service to handle the actual writing of the markdown files.

The `dumpSignal` method is the core functionality, responsible for creating these markdown files with the relevant signal data and conversation history.

## Class OptimizerValidationService

The OptimizerValidationService helps keep track of your optimizers, ensuring they're properly registered and available for use within your backtesting framework. Think of it as a central directory for optimizers.

It allows you to add new optimizers to this directory, making sure you don't accidentally register the same optimizer twice.

When you need to check if an optimizer is valid, the service quickly confirms its existence and avoids unnecessary checks by remembering previous validations.

You can also easily get a complete list of all the optimizers currently registered within the system.



It’s designed to be efficient and prevent common errors related to optimizer registration.

## Class OptimizerUtils

This section provides helpful tools for working with your trading strategies, particularly when you’re using an optimizer. You can use these tools to retrieve information about generated strategies, create the actual code for those strategies, and easily save that code to files.

The `getData` function allows you to pull all the relevant information about a strategy generated by your optimizer, giving you a good overview of how it's built and configured.

Need the complete strategy code ready to run? `getCode` generates the full, executable code, including all the necessary imports and supporting structures.

Finally, `dump` simplifies the process of saving your strategy code to disk. It creates the necessary file structure and saves the code with a clear, descriptive filename, so you can easily find and deploy your strategies.

## Class OptimizerTemplateService

This service helps build code snippets for your trading strategies using a large language model (LLM). It acts as a starting point, which you can customize further.

It handles a lot of the groundwork for you, including generating code for different timeframes (like 1-minute, 5-minute, and hourly data), structuring the LLM's output into JSON format for trading signals, and creating logs to help you debug your strategy. It also uses CCXT to connect to exchanges like Binance and allows for comparing different strategies using a walker-based system.

You're provided with pre-built code for things like generating import statements, prompting the LLM with data, and setting up the exchange and timeframe configurations. There are also helpful functions for dumping data for debugging and using the LLM for market analysis and creating structured trading signals – the signal schema defines what those signals will look like, including position type, explanation, price levels, and estimated duration.

## Class OptimizerSchemaService

This service helps keep track of different optimizer configurations, ensuring they're set up correctly and can be easily found. Think of it as a central place to define and manage how your backtesting experiments are structured. 

It uses a tool registry to securely store these configurations, making sure they don't accidentally change. When you add a new configuration, the service checks to make sure it has the essential information, like a name and the data it needs to run.

You can also update existing configurations by only changing a few settings; the service will combine your changes with the original setup. Finally, it provides a simple way to retrieve a specific configuration by its name when you need it.

## Class OptimizerGlobalService

This service acts as a central point for working with optimizers, ensuring everything is validated along the way. It handles requests like fetching data, generating code, and saving code to a file.

Before any action is taken, it verifies that the optimizer you're requesting actually exists. It then passes the request on to another service for the actual work to be done.

Here’s a quick breakdown of what it provides:

*   **getData:**  Allows you to retrieve data and get information about your trading strategies.
*   **getCode:**  Generates the complete code for your strategy, ready to be executed.
*   **dump:**  Takes the generated code and saves it to a file, so you can easily use it later.

Essentially, this service provides a secure and controlled way to interact with optimizers within the trading framework.

## Class OptimizerConnectionService

This service helps you manage and reuse optimizer connections, making your backtesting process more efficient. It essentially creates and stores optimizer clients so you don't have to recreate them every time you need one. 

The service remembers which optimizers you've already connected to, improving performance. It also combines your custom templates with default templates to create the final configuration.

You can use `getOptimizer` to get an optimizer – it will either retrieve a cached instance or create a new one. `getData` helps you gather all the data needed and figure out strategy metadata, while `getCode` creates the complete, ready-to-run code for your strategies. Finally, `dump` lets you save that generated code directly to a file.

## Class LoggerService

The LoggerService helps you keep track of what's happening in your backtesting system by providing a consistent way to log information. It automatically adds helpful details to your log messages, like which strategy, exchange, and frame are being used, and the symbol, time, and whether it’s a backtest or live run.

You can use the `log`, `debug`, `info`, and `warn` methods to record different types of messages.  The `setLogger` method lets you plug in your own custom logging solution if you prefer. If you don’t provide a logger, it will default to a "do nothing" logger to avoid errors. The internal services, `methodContextService` and `executionContextService`, manage the context information added to the logs.

## Class LiveUtils

LiveUtils provides helpful tools to manage live trading operations, acting as a central point for running strategies and monitoring their progress. Think of it as a simplified way to interact with the underlying live trading system, making it easier to get started and keep things running smoothly.

It provides a convenient `run` function that generates trading results continuously, and crucially, it automatically handles crashes by restoring from saved data, preventing data loss.  You can also kick off a background trading process with `background` if you just need it to perform actions like saving data or triggering callbacks without directly observing the results. 

If you need to pause a strategy’s signal generation, use `stop` to gracefully halt new signals while letting existing ones complete.  For insights into how things are performing, `getData` provides statistics and `getReport` creates a readable markdown report, and `dump` will save the report to your desired location. Finally, `list` offers a quick overview of all running live trading instances and their current status.  It's designed to be a one-stop shop for managing your live trading.

## Class LiveMarkdownService

The LiveMarkdownService helps you keep track of your backtest-kit strategies by automatically creating detailed reports. It listens to every trading event – from when a strategy is idle to when a trade is opened, active, or closed.  It organizes this data per strategy and symbol, creating markdown tables filled with specifics about each event.  You'll also get easy-to-read trading statistics, like win rate and average P&L.  The service saves these reports as markdown files in a designated "logs/live" directory, making it simple to review performance.

You can customize how it works, for example clearing data for specific strategy and symbol pairs. The service automatically sets itself up, so you don't need to worry about manual configuration; it's ready to go when you start your backtest-kit run. Each combination of symbol and strategy has its own isolated data storage, preventing interference between different tests.

## Class LiveLogicPublicService

This service helps manage and orchestrate live trading sessions, simplifying the process by handling context automatically. It essentially hides some of the complexity of managing trading context, like strategy and exchange names, so you don't have to pass them around explicitly in every function call.

Think of it as a continuous, never-ending stream of trading signals (both opening and closing) for a specific symbol. The system is designed to be robust; if something goes wrong and the process crashes, it can recover and pick up where it left off thanks to saved state. It keeps track of time using the system clock, ensuring accurate progression through the trading day.

To run a live trading session, you simply provide the symbol you want to trade. The service takes care of the rest, injecting the necessary context and managing the continuous flow of trading data.


## Class LiveLogicPrivateService

The `LiveLogicPrivateService` helps automate your live trading by continuously monitoring and reacting to market signals. It operates in an ongoing loop, constantly checking for new signals and providing updates as it opens or closes trades. Think of it as a tireless engine running your trading strategy.

It uses an efficient streaming approach, yielding results as an async generator to avoid memory issues. This generator will keep running indefinitely, providing a continuous stream of trade-related information. If something goes wrong and the process crashes, it automatically recovers and picks up where it left off, thanks to built-in crash recovery. The service relies on other components like a logger service and core strategy service to function properly. 

You start the process by calling the `run` method, specifying the trading symbol you want to monitor. This method delivers results like opened and closed trade signals.

## Class LiveCommandService

This service gives you a simple way to interact with the live trading parts of the framework, making it easy to inject dependencies and use within your application. It acts as a convenient wrapper around the more detailed live logic service. 

Think of it as the central point for executing live trades, handling things like strategy validation and exchange checks behind the scenes. The `run` method is the key – it's an ongoing process that continuously generates results for a specific trading symbol, with built-in mechanisms to recover from unexpected issues and keep the trading going. It passes along important information about the strategy and exchange being used.

## Class HeatUtils

This class helps you visualize and understand how your trading strategies are performing. It collects data about your portfolio's performance, broken down by each asset you traded.

You can easily get a summary of the data for a specific strategy using the `getData` method, which returns detailed statistics. 

To present this data in a readable format, the `getReport` method creates a markdown table showing key metrics like profit/loss, Sharpe ratio, and maximum drawdown, sorted by profitability.

Finally, `dump` lets you save that nicely formatted report to a file on your computer, making it easy to share or review later. It's set up as a single, always-available instance to simplify using these functions within your backtesting framework.

## Class HeatMarkdownService

The HeatMarkdownService helps you visualize and analyze your trading portfolio's performance through interactive heatmaps and detailed reports. It automatically tracks closed trades across different strategies, giving you a clear overview of how each one is doing.

You can get a summary of key metrics like total profit and loss, Sharpe ratio, and maximum drawdown for both the entire portfolio and for individual symbols. The service creates beautifully formatted Markdown reports that you can easily share or store.

Each strategy has its own dedicated storage, ensuring that your data stays organized and separate. The service also handles potential math errors (like dividing by zero) gracefully, preventing unexpected issues. 

To get started, the service initializes itself automatically, but you can also clear the data manually or save the generated reports to a file.

## Class FrameValidationService

This service helps you keep track of and double-check your trading timeframes, ensuring everything is set up correctly before you start backtesting or live trading. It acts as a central place to register your different timeframes, like "1m" or "1h," and verify they exist before you try to use them in your strategies. 

Think of it as a quality control system for your timeframes.  You use `addFrame` to tell the service about your different timeframes and their specific structures.  The `validate` function is how you make sure a particular timeframe is actually registered before you try to use it – preventing errors down the line.  If you ever need to see a complete list of all the timeframes you’re using, `list` will give you that information.  The service is also designed to be efficient, remembering previous validations so it doesn't have to repeat the checks every time.

## Class FrameSchemaService

The FrameSchemaService helps you keep track of the structure of your trading frames, ensuring consistency and preventing errors. It acts like a central library for defining and managing these frame schemas.

It uses a type-safe registry to store your frame definitions, which means it can help catch mistakes early on. You can add new frame structures using `register`, update existing ones with `override`, and easily retrieve them by name using `get`.

Before a frame is added, the service performs a quick check (`validateShallow`) to confirm that the basic structure and data types are correct. This helps avoid issues down the line. It keeps a record of the schemas and lets you interact with them in a structured way.

## Class FrameCoreService

FrameCoreService is a central piece that helps manage the timing of your backtesting. It works closely with the connection to your data source, generating the specific time periods you're going to analyze. Think of it as the engine that provides the sequence of dates and times for your trading strategy to run against. It's a behind-the-scenes component, primarily used internally, but crucial for ensuring your backtest uses the correct timeframe data.

The service relies on a logger for recording events and a connection service to fetch data.

The `getTimeframe` method is the most important function you'll likely interact with; it creates an array of dates based on the symbol and frame name you provide.


## Class FrameConnectionService

The FrameConnectionService acts as a central hub for managing and accessing different trading frames, like daily, weekly, or monthly data. It automatically directs requests to the correct frame implementation based on the currently active trading context. 

Think of it as a smart router – you ask for a particular trading frame, and it figures out which one you need and provides it. To make things efficient, it remembers previously accessed frames, so it doesn’t have to recreate them every time. 

It also handles the timeframe for backtesting, letting you define the start and end dates for your historical analysis. When you're doing live trading, there are no frame constraints, so it knows to operate differently.

You can get a specific frame using `getFrame`, providing a frame name like “day” or “week.” To determine the date range for backtesting, use `getTimeframe` with a symbol and frame name.

## Class ExchangeValidationService

The ExchangeValidationService helps keep track of your trading exchanges and ensures they're set up correctly before your backtesting runs. Think of it as a central place to register each exchange you're using, like Coinbase or Binance.

You can add new exchanges using `addExchange()`, providing their configuration details.  Before running any tests or trades, `validate()` makes sure that exchange actually exists in your configuration. It's designed to be efficient because it remembers previous validation results, a technique called memoization, so it doesn’t have to re-check every time.  If you need a quick overview of all the exchanges you've registered, the `list()` function gives you a list of their configurations.

## Class ExchangeSchemaService

The ExchangeSchemaService helps keep track of information about different cryptocurrency exchanges. It acts like a central repository, storing details about each exchange in a structured and type-safe way. 

You can add new exchanges using the `addExchange` function and retrieve the details of a specific exchange by its name. Before adding an exchange, the service performs a quick check to make sure it has all the necessary properties in the correct format. If an exchange already exists, you can update its information with a partial set of changes using the override function.

## Class ExchangeCoreService

The ExchangeCoreService acts as a central hub for interacting with an exchange, intelligently incorporating information about the trading environment. It combines connection services with contextual information like the trading symbol, specific time, and whether it's a backtest scenario.

This service simplifies tasks like retrieving historical or future candle data, calculating average prices, and formatting prices and quantities. The validation process for exchange configurations is streamlined and efficient, avoiding repeated checks. 

Essentially, it handles the complexities of exchange interactions while ensuring that the trading context is always considered. It's a foundational element used internally by other core logic services.

## Class ExchangeConnectionService

The `ExchangeConnectionService` acts as a central hub for interacting with different cryptocurrency exchanges. It simplifies the process of making requests by automatically routing them to the correct exchange based on the current context. Think of it as a smart dispatcher that knows which exchange to talk to and how.

It keeps track of exchange connections for efficiency, so it doesn’s have to repeatedly establish new connections. You can request historical candle data, get the next batch of candles for backtesting, retrieve the current average price (either from a live exchange or calculated from historical data), and format prices and quantities to meet specific exchange rules. The service handles the complexity of working with various exchanges, so you can focus on your trading logic.

## Class ConstantUtils

This class provides pre-calculated percentages designed to help manage your trading strategies, specifically around take-profit and stop-loss levels. These values are based on the Kelly Criterion and incorporate a system of risk decay.

The `TP_LEVEL1` property (30) represents an early take-profit trigger, securing a small portion of your potential gains. `TP_LEVEL2` (60) allows for a more substantial profit capture while still letting the trend potentially continue, and `TP_LEVEL3` (90) allows for almost complete profit realization with minimal risk exposure.

For stop-loss management, `SL_LEVEL1` (40) provides an early warning, allowing you to reduce your exposure if the trade isn’t performing as expected. `SL_LEVEL2` (80) acts as a final safety net, designed to exit the remaining position and limit potential losses. You can use these values to automatically adjust your take-profit and stop-loss orders during a trade.

## Class ConfigValidationService

This service acts as a safety net for your trading configurations, making sure your settings make mathematical sense and won't lead to unprofitable trades. It checks all your global configuration parameters, like slippage, fees, profit margins, and timeouts, to prevent common errors. 

The service makes sure percentage-based values are positive, confirms that time-related parameters are valid integers, and most importantly, that your take profit distance is sufficient to cover trading costs. It validates relationships between settings, like ensuring stop loss distances are appropriately set. Think of it as a pre-trade quality check to catch potential issues before they impact your backtesting results.


## Class ClientSizing

This component, called ClientSizing, helps determine how much of your capital to allocate to each trade. It’s designed to be flexible, allowing you to choose from different sizing strategies like fixed percentages, the Kelly Criterion, or using Average True Range (ATR). You can also set limits on how large your positions can be, both in absolute terms and as a percentage of your total capital. The ClientSizing module can be customized with callbacks for extra validation steps or to keep a record of sizing decisions. Ultimately, it’s the system that figures out the optimal amount to trade based on your chosen parameters and risk tolerance.

It takes configuration details through its constructor.

The `calculate` method is the core function - it takes trade parameters and returns the calculated position size.

## Class ClientRisk

ClientRisk helps manage risk for your trading portfolio, acting as a safety net to prevent signals from opening too many positions at once. It's designed to work across multiple trading strategies, allowing you to see the overall risk exposure.

It keeps track of all currently open positions and has built-in checks to ensure you aren't exceeding defined limits, such as the maximum number of concurrent positions. You can also add your own custom validation rules to tailor the risk management to your specific needs, with access to details of existing positions.

The `checkSignal` method is a core part, evaluating signals before they're executed and allowing you to define how those evaluations trigger callbacks. Signals are registered and removed using `addSignal` and `removeSignal`, which are important for updating the tracked positions. The system automatically initializes its position tracking, skipping this step when running in backtest mode.

## Class ClientOptimizer

The ClientOptimizer helps manage the optimization process, connecting to data sources and handling the behind-the-scenes work. It gathers data, builds a history of conversations for the LLM, and generates the strategy code needed for backtesting.

You can think of it as a central hub that receives instructions and orchestrates the creation of optimized trading strategies. It fetches data, generates code, and can even save the final code to a file for you.

The `getData` method retrieves data to build strategy information, while `getCode` assembles the complete, runnable strategy code.  The `dump` function lets you save the generated code to a file, automatically creating any necessary folders. It works in conjunction with OptimizerConnectionService to set up and run these optimization processes.

## Class ClientFrame

The ClientFrame handles creating the timeline of data points your backtesting logic will use. Think of it as the engine that provides the sequence of dates and times for your trading simulations. It's designed to avoid unnecessary work by caching the generated timeframes, so it doesn't recreate them every time. You can easily adjust how far apart these points are – from one-minute intervals all the way to three-day gaps.  It also allows you to add your own checks and recording functions during the timeframe generation process. The `getTimeframe` method is its core function, producing the date arrays needed to run your backtests, and leveraging a caching system to improve efficiency.

## Class ClientExchange

This class is your link to real-time and historical market data. It provides a way to retrieve past and future candle data, essential for backtesting and live trading. You can use it to get historical prices, look ahead to future prices (for simulation purposes), and calculate the VWAP, a volume-weighted average price, using recent trading activity.  The class also handles the tricky task of formatting quantities and prices to match the specific rules of the exchange you're connected to, ensuring your orders and data look correct. The system prioritizes efficiency by using prototype functions to minimize memory usage.

## Class BacktestUtils

This utility class provides helpful tools for running and managing backtests within the framework. You can use it to easily execute backtests for specific symbols and strategies, with convenient logging built in. 

It manages individual backtest instances for each symbol-strategy pairing, ensuring isolation.  You can run backtests in the background, which is useful when you only need side effects like logging or callbacks and don’t need to examine the results directly.  

The `stop` function allows you to pause a strategy’s signal generation, ensuring a clean stop to the backtest. You can also retrieve statistical data and generate reports in a standard markdown format.  Finally, a list command displays the status of all active backtest runs.

## Class BacktestMarkdownService

The BacktestMarkdownService helps you create easy-to-read reports about your backtesting results. It keeps track of the signals generated by your strategies, specifically focusing on those that have closed. 

This service listens for updates during the backtest process and stores information about closed signals separately for each symbol and strategy you’re testing. You’re able to generate markdown tables summarizing these signals, which are then saved to files.

The service automatically creates a storage area for each symbol and strategy combination.  It handles the report generation and file saving for you, creating organized reports in the logs/backtest/ directory. You don’t need to worry about manually managing report files – it takes care of that.  It also initializes itself automatically when first used, simplifying setup. Clearing the stored data is also possible, allowing you to start fresh with new backtesting runs.

## Class BacktestLogicPublicService

BacktestLogicPublicService helps you run backtests in a clean and organized way. It builds on top of another service, automatically managing important details like the strategy name, exchange, and data frame for you. This means you don't have to constantly pass these details around when you're running your backtest.

The `run` method is your main tool – it takes a symbol (like "BTC-USD") and runs the backtest, delivering results as a stream of data. You can think of it as automatically setting up the environment for your backtesting logic to execute.


## Class BacktestLogicPrivateService

This service manages the entire backtesting process, focusing on efficiency. It coordinates fetching historical data (timeframes), processing signals, and running your trading strategy. 

Think of it as the conductor of an orchestra – it brings together different components like fetching data, calculating signals, and executing trades. It works by continuously processing data in smaller chunks, which is much more memory-friendly than loading everything at once.

The `run` method is the main entry point.  You provide a symbol (like "BTCUSDT"), and it returns a stream of results – each result represents a completed trading signal. The testing can be stopped early by interrupting the stream. This service relies on other services for tasks like logging, strategy execution, data fetching, and managing the context of your backtesting methods.

## Class BacktestCommandService

This service acts as a central hub for triggering and managing backtesting operations within the system. It’s designed to be easily integrated into your applications through dependency injection.

Think of it as a convenient way to access the core backtesting engine, hiding some of the complexity behind a simple interface. It handles things like validating your strategy and exchange setups before the backtest actually runs.

The `run` method is the main entry point – you provide a symbol (like a stock ticker) and some contextual information (the strategy, exchange, and frame you're using), and it starts the backtesting process, yielding results as they become available.


# backtest-kit interfaces

## Interface WalkerStopContract

This interface describes what happens when a Walker is told to stop. Think of it as a notification that a particular trading strategy, running under a specific name, needs to be halted. The notification includes the trading symbol involved, the name of the strategy being stopped, and the name of the Walker that triggered the stop. This is particularly useful when you have multiple strategies running at the same time because it allows you to precisely target which strategy should be stopped.

## Interface WalkerStatistics

WalkerStatistics helps you easily understand the performance of different trading strategies after a backtest. Think of it as a central place to collect and organize the results. It takes the standard WalkerResults and adds extra information to help you compare how different strategies performed against each other. 

The key piece of information it holds is the `strategyResults` property, which is simply a list of all the results for each strategy you tested. This makes it straightforward to compare metrics like profit, drawdown, and Sharpe ratio across various approaches.


## Interface WalkerContract

The WalkerContract represents updates as a backtesting framework evaluates different trading strategies. Think of it as a progress report, letting you know when a strategy finishes its test run and how it performed. 

Each WalkerContract tells you things like the name of the strategy just tested, the exchange and symbol it was evaluated on, and the statistics gathered during that backtest. Crucially, it includes the strategy’s metric value (the thing being optimized), along with the best metric value seen so far across all strategies tested. 

You're also kept informed about the overall progress—how many strategies have been tested and how many are left to go—so you can track the entire backtesting process. Essentially, it’s a structured way to monitor the ranking and performance of trading strategies.

## Interface TickEvent

This interface defines a standardized format for tick events, making it easier to generate reports regardless of the specific trading action. Each event includes a timestamp and the type of action taken – whether the system is idle, a position is opened, actively trading, or closed. 

For events involving trades, you’ll find details such as the trading pair symbol, the signal ID, the position type, and any notes associated with the signal. The interface also stores pricing information, including the current price, open price, take profit, and stop loss levels. Active trades provide progress percentages towards both take profit and stop loss. Closed trades include the percentage profit/loss (PNL), the reason for closing, and the duration of the trade.

## Interface ScheduleStatistics

The `ScheduleStatistics` object gives you a snapshot of how your scheduled trading signals are performing. It collects information about every scheduled, opened, and cancelled signal to provide a clear picture of their lifecycle.

You'll find a detailed list of all events in the `eventList` property, allowing you to examine individual signal actions. The `totalEvents`, `totalScheduled`, `totalOpened`, and `totalCancelled` properties give you the raw counts for each status.

To quickly gauge performance, look at the `cancellationRate` and `activationRate`. A lower cancellation rate and higher activation rate generally indicate better scheduling effectiveness. Finally, `avgWaitTime` tells you how long cancelled signals lingered, while `avgActivationTime` shows how long it took for signals to activate after being scheduled.

## Interface ScheduledEvent

This interface holds all the key details about scheduled, opened, or cancelled trading events, making it easy to generate reports and analyze performance.

Each `ScheduledEvent` includes a timestamp marking when the event occurred, and specifies whether it was a scheduled event, an opened trade, or a cancellation. You'll find information like the trading symbol, a unique signal ID, and the type of position (e.g., long or short).

It also provides the entry price, take profit level, and stop-loss price associated with the trade, along with the current market price at the time. For cancelled events, you're given the close timestamp and the duration of the trade, while opened trades also have duration information. Essentially, this is a complete package of information for understanding the lifecycle of a trade.

## Interface RiskStatistics

This data provides a snapshot of your risk management performance. It tracks when your system rejected trades due to risk controls. You’re given a detailed list of each rejection event, including all the information associated with it.  Beyond that, you can see the total number of rejections that occurred and how they are distributed - broken down by the trading symbol and by the specific trading strategy involved. This helps identify areas where your risk controls might need adjustment or further investigation.

## Interface RiskEvent

This interface holds all the details when a trading signal is rejected due to risk limits. Think of it as a record of why a potential trade didn't happen.

It includes information like the exact time of the rejection, the trading pair involved, and the specifics of the signal that was blocked. You’ll also find the name of the strategy that generated the signal, the exchange being used, the current market price at the time, the number of active positions, and a comment explaining why the signal was rejected. This data is really helpful for understanding and improving your trading strategies and risk management.

## Interface RiskContract

The RiskContract provides details about signals that were blocked due to risk validation. It's like a record of when your trading system tried to execute something, but a risk check prevented it. 

You’ll find information like the trading pair involved (symbol), the specifics of the signal itself (pendingSignal), and which strategy was attempting to place the trade (strategyName). It also includes the exchange used, the market price at the time of the rejection (currentPrice), and how many other positions were already open (activePositionCount). 

A comment field (comment) provides a reason for the rejection, and a timestamp (timestamp) marks exactly when the rejection occurred. This contract helps you understand and monitor potential risk violations and build reports about rejected trading opportunities.

## Interface ProgressWalkerContract

The `ProgressWalkerContract` helps you keep an eye on how a backtest walker is doing. It sends updates as the walker runs, letting you know its progress. 

You’re given the name of the walker, the exchange it’s using, and the frame it’s operating within. It also provides the trading symbol, the total number of strategies the walker needs to evaluate, and how many it's already finished. Finally, you’re given a percentage representing the overall completion of the process – a value between 0 and 100.

## Interface ProgressOptimizerContract

This interface describes updates you're likely to see as an optimizer is working. It provides information about what's happening during the optimization process itself. 

You’ll find details like the name of the optimizer being run, the trading symbol it's focused on, and how much data it’s already processed compared to the total amount it needs to work through. The `progress` property gives you a simple percentage representing how far along the optimizer is.


## Interface ProgressBacktestContract

This interface helps you keep an eye on how your backtest is running. It provides information about the trading exchange, the strategy you're testing, and the specific symbol being analyzed. You'll see the total number of historical data points the backtest will use, how many have already been processed, and a percentage indicating overall completion. Essentially, it lets you monitor the backtest's journey from start to finish, giving you insight into its progress.

## Interface PerformanceStatistics

This object holds the overall performance data for a trading strategy. It's like a summary report, combining information about how the strategy performed. 

You'll find the strategy's name, the total number of performance events tracked, and the total time it took to run all the performance calculations. 

The `metricStats` property breaks down the performance by specific metric types, letting you see how different aspects of the strategy fared. Finally, you can access the complete list of raw performance events in the `events` array for detailed examination.

## Interface PerformanceContract

This interface helps you keep track of how your trading strategies are performing. It records key details about different operations, like how long they take to execute. You'll see timestamps, durations, and information about the strategy, exchange, and symbol involved. It's especially useful for spotting areas where your code might be slow or inefficient – kind of like a health check for your trading system. Each event tells you when it happened, when the last one did, what kind of operation it was, how long it took, and which strategy and trading symbol were used. There’s also a flag to distinguish between events from backtesting and live trading.

## Interface PartialStatistics

This interface holds key statistical information gathered during a backtest, specifically focusing on partial profit and loss events. Think of it as a snapshot of how your trading strategy performed at different milestones. 

You'll find a list of individual events (`eventList`) with all their details here, along with the overall counts of profit (`totalProfit`), loss (`totalLoss`), and the total number of events processed (`totalEvents`). It's useful for analyzing the frequency and magnitude of profits and losses encountered.

## Interface PartialProfitContract

This interface represents a notification that a trading strategy has reached a partial profit level, like 10%, 20%, or 30% profit. It's used to keep track of how a strategy is performing and when partial take-profit orders might be executed.

Each notification includes important details like the trading symbol, the name of the strategy that triggered it, and the exchange it’s running on. You'll also find the complete data related to the signal, the current market price at the time of the event, and the specific profit level reached.

The notifications will specify whether the event comes from a backtest (using historical data) or a live trading execution. A timestamp is also included, marking precisely when the level was achieved, which is either the moment of detection in live trading or the candle's timestamp during backtesting. You’re guaranteed to receive each profit level only once for each signal, even if prices move significantly in a single tick.

## Interface PartialLossContract

The PartialLossContract represents notifications about a trading strategy hitting predefined loss levels, like -10%, -20%, or -30% loss from the entry price. These notifications help you keep track of how a strategy is performing and when stop-loss levels are triggered.

Each notification contains details such as the trading symbol, the strategy’s name, the exchange used, the full signal information, the price at which the level was reached, the specific loss level reached (e.g., -20%), and whether it's a backtest or live trade. The timestamp indicates when the loss level was detected—either in real-time or based on historical data during a backtest. This contract is used by services to generate reports and allows you to create custom callbacks to react to these loss level events.

## Interface PartialEvent

This `PartialEvent` object bundles together all the key details whenever a profit or loss milestone is hit during a trading simulation or live trading. It provides a consistent way to track and report on how your strategies are performing. 

Each event includes the exact time it occurred, whether it was a profit or a loss, the symbol being traded, the name of the strategy involved, and a unique identifier for the signal that triggered the trade. You’ll also find information about the position type (like long or short), the current market price, the specific profit/loss level reached, and whether the event occurred during a backtest or in live trading. This data helps you analyze and understand the performance of your strategies over time.

## Interface MetricStats

This data structure represents a collection of statistics gathered for a particular performance metric. It essentially summarizes how often a metric was recorded and provides insights into its performance characteristics.

You'll find details like the total number of times the metric was observed, the overall time it took for all observations, and key duration-related values. This includes the average duration, the shortest and longest durations, and statistical measures like standard deviation, median, and percentiles (95th and 99th).

Furthermore, it contains information about the time between events that triggered the metric, including average, minimum, and maximum wait times. This helps to understand not just the metric's duration, but also how frequently it occurs.

## Interface MessageModel

The MessageModel helps track the conversation history when working with large language models. Think of it as a way to remember what's been said – both the instructions given to the model and the user's inputs and the model’s replies. Each message has a `role` which tells you who sent it: either the system providing instructions, the user asking a question, or the assistant (the language model) giving a response.  The `content` property holds the actual text of the message itself.

## Interface LiveStatistics

This interface provides a collection of key statistics derived from live trading activity. You're given a detailed history of every event that occurred, from idle periods to trade openings, closings, and everything in between. It also tracks the total number of events, the number of completed trades, and differentiates between winning and losing trades. 

You can easily calculate your win rate, average profit per trade, and overall cumulative profit.  The interface includes measures of risk like standard deviation and Sharpe Ratio, both annualized for a clearer picture of long-term performance.  A certainty ratio helps understand the consistency of winning versus losing trades, while expected yearly returns provide a projection based on trade duration and profit.  Remember that any statistic marked as "null" indicates the calculation was unreliable and should be interpreted with caution.

## Interface IWalkerStrategyResult

This interface represents the outcome of running a trading strategy during a backtest. It bundles together key information about that strategy's performance. You’ll find the strategy's name clearly listed, along with comprehensive statistics detailing its backtesting results. A single metric value is provided for comparing the strategy against others, and a rank indicates its position in the overall comparison, with the best strategy receiving a rank of 1. Essentially, it’s a neat package of data to understand how each strategy fared.

## Interface IWalkerSchema

The `IWalkerSchema` helps you set up A/B testing for your trading strategies. Think of it as a blueprint for comparing different approaches. 

You give it a unique name to identify the test, and can add a note for your own documentation. It specifies which exchange and timeframe should be used for all the strategies being tested. 

The core of the schema is the list of strategy names you want to compare – these strategies need to be registered beforehand. You also define the metric you’ll use to evaluate performance, such as Sharpe Ratio, although you can choose another.  Finally, you can optionally provide callbacks to be notified about different stages of the testing process.

## Interface IWalkerResults

This object holds all the information gathered after a comparison of different trading strategies. It tells you which strategy was tested, the symbol it was tested on, and the exchange and timeframe used. 

You'll find details about the metric used for evaluation, like total strategies tested and ultimately, the name of the best-performing strategy. It also provides the metric score of that best strategy along with comprehensive statistics about its performance. This lets you quickly see the key results of a backtesting run.

## Interface IWalkerCallbacks

This interface lets you listen in on what’s happening during the backtesting process. Think of it as a way to be notified about key milestones.

You can get a notification when a specific strategy begins testing, and another when that test finishes, giving you access to performance statistics and a key metric.

If a strategy encounters a problem and fails, you’ll be notified with details about the error.

Finally, when all the strategies have been backtested, a final notification signals the completion of the entire process, providing you with a summary of all the results. This allows you to monitor progress, debug issues, or perform custom actions as backtesting unfolds.

## Interface IStrategyTickResultScheduled

This interface represents a special kind of tick result in backtest-kit, indicating that a trading signal has been generated and is currently waiting for the price to reach a specific entry point. Think of it as a signal that's been "scheduled" and is on hold.

The `action` property confirms this is a "scheduled" signal.

It also carries details about the signal itself – the `signal` object holds all the information about the trade you’re waiting to execute. 

You'll also find tracking information included, such as the `strategyName`, `exchangeName`, `symbol` (the trading pair like BTCUSDT), and the `currentPrice` which was the price when the signal was initially scheduled. This helps you understand the context of the signal and monitor its progress.

## Interface IStrategyTickResultOpened

This interface represents the result you get when a new trading signal is created within your backtesting strategy. Think of it as a notification that a signal has been successfully generated and saved.

It provides key details about the signal, including its unique ID (through the `signal` property), the name of the strategy that created it, the exchange being used, and the trading symbol involved. You’ll also find the current VWAP price at the moment the signal was opened. This information is useful for monitoring and analyzing how your strategy is performing.

## Interface IStrategyTickResultIdle

This interface describes what happens when your trading strategy is in an idle state, meaning it's not currently issuing any buy or sell orders. It provides information about the conditions at that moment, including the name of the strategy and exchange being used, the trading symbol (like BTCUSDT), and the current price. Essentially, it's a record of the market conditions while your strategy is waiting for a new trading opportunity. The `action` property clearly indicates that the strategy is in an "idle" state and there's no active signal being generated.

## Interface IStrategyTickResultClosed

This interface represents the result you get when a trading signal is closed, providing a complete picture of what happened. It includes details like the original signal parameters, the final price used for the trade, and the reason for closing the signal – whether it was due to a time limit, a take-profit target, or a stop-loss trigger. 

You'll also find information about when the signal was closed, the profit and loss generated from the trade (including fees and slippage), and identifiers for the strategy and exchange used. This result helps you understand the performance of your trading strategies and diagnose any issues. Essentially, it's the final report card for a closed trade.


## Interface IStrategyTickResultCancelled

This interface describes what happens when a scheduled trading signal is cancelled – meaning it didn’t result in a trade being opened. It's used to represent situations where a signal was planned but didn't activate, perhaps because it was stopped by a stop-loss before a position could be entered.

The data provided includes details like the signal that was cancelled, the current price at the time of cancellation, the exact timestamp of the cancellation, and identifying information about the strategy, exchange, and trading symbol involved. Think of it as a record of a planned trade that didn’t happen. 

You’ll find the `action` property clearly marked as "cancelled" to easily identify this type of result.

## Interface IStrategyTickResultActive

This interface describes what happens when a trading strategy is actively monitoring a signal, waiting for a take profit, stop loss, or time expiration. It essentially represents a signal that's "in play."

You'll find details about the signal itself, including its data and the current VWAP price being used for monitoring.  It also keeps track of which strategy and exchange initiated the trade, along with the symbol being traded. 

Crucially, the `percentTp` and `percentSl` properties tell you how close the trade is to hitting either the take profit or stop loss levels – think of them as progress bars towards those targets.

## Interface IStrategySchema

This interface, `IStrategySchema`, describes how you define a trading strategy within the backtest-kit framework. Think of it as the blueprint for your strategy's behavior.

Each strategy gets a unique `strategyName` for identification. You can add a helpful `note` to explain what your strategy does.

The `interval` setting controls how often your strategy can generate signals – it's a way to avoid overwhelming the system.

The core of your strategy lies in the `getSignal` function. This is where you write the logic to decide when to buy or sell, and it must return a structured signal or nothing at all. You can even make signals wait for a specific price to be reached.

You can also add optional `callbacks` to handle events like when a trade is opened or closed.

Finally, `riskName` allows you to categorize the strategy for risk management purposes.


## Interface IStrategyResult

The `IStrategyResult` interface holds all the information you need to evaluate and compare different trading strategies. Think of it as a single row in a table showing how each strategy performed. It includes the strategy's name so you know which one you're looking at, a comprehensive set of statistics detailing its backtest results, and a specific metric value used to rank the strategies against each other. This value might be null if the strategy’s result wasn't valid.

## Interface IStrategyPnL

This interface, `IStrategyPnL`, represents the profit and loss result for a trading strategy. It gives you a clear picture of how a trade performed, taking into account the impact of fees and slippage, which are common costs in real-world trading.

The `pnlPercentage` property tells you the profit or loss as a percentage – a positive number means you made money, a negative number means you lost money.

You can also see the `priceOpen`, which is the price you initially entered the trade at, adjusted for those fees and slippage.  Similarly, `priceClose` shows the price at which you exited the trade, also adjusted to reflect those costs.

## Interface IStrategyCallbacks

This interface provides a way to hook into the key events of your trading strategy within the backtest-kit framework. Think of these callbacks as notifications the framework sends to your strategy at specific moments.

You can define functions to be executed when a new signal is opened, when a signal is actively being monitored, or when the system is in an idle state with no signals open.  

The framework also lets you listen for events like signal closure, scheduled signal creation, and cancellation.  You're notified with relevant data like current price, signal details, and revenue/loss percentages. There are also callbacks to handle partial profit and loss scenarios, providing insights into the progress of your trades. Lastly, a tick callback lets you respond to every market update.

## Interface IStrategy

The `IStrategy` interface outlines the essential functions a trading strategy needs to have within the backtest-kit framework.

The `tick` function is the heart of the strategy's execution, handling each price update and checking for potential trading signals, while also monitoring stop-loss and take-profit levels.

`getPendingSignal` allows the strategy to check if there's an existing order it's managing and lets it monitor its progress.

The `backtest` function lets you quickly test your strategy on historical data to see how it would have performed. It simulates the strategy's behavior, candle by candle, looking for signals and monitoring TP/SL.

Finally, `stop` provides a way to pause the generation of new signals, which is useful for gracefully shutting down a strategy without closing any existing positions.

## Interface ISizingSchemaKelly

This interface defines how to size trades using the Kelly Criterion, a method designed to maximize long-term growth. When implementing this, you’re essentially telling the backtest kit to use a specific formula to determine how much of your capital should be risked on each trade. The `method` property always identifies this as a Kelly Criterion approach, and the `kellyMultiplier` controls the aggressiveness of the sizing – a lower multiplier means less risk per trade, while a higher one means more. The default value of 0.25 represents a quarter Kelly, which is a common and generally safer approach.

## Interface ISizingSchemaFixedPercentage

This schema defines how much of your capital to risk on each trade, using a fixed percentage. It's simple to use – you just specify a `riskPercentage` value, which represents the percentage of your total capital you’re willing to lose on a single trade.  The `method` property is always set to "fixed-percentage" to identify this specific sizing strategy. This is a straightforward approach for consistent risk management across your backtesting scenarios.

## Interface ISizingSchemaBase

This interface, `ISizingSchemaBase`, acts as a foundation for defining how much of your trading account to allocate to each trade. Think of it as setting rules for your position sizing. 

It includes a unique name to identify the sizing method, a note for any important details or explanations, and boundaries for position sizes – setting both a percentage cap and absolute limits for the minimum and maximum size of a trade. 

You can also attach optional lifecycle callbacks to customize when and how the sizing is applied.

## Interface ISizingSchemaATR

This schema defines how your trading strategy determines the size of each trade, using the Average True Range (ATR) as a key factor. 

It specifies that the sizing method is "atr-based", meaning position sizes will be calculated in relation to the ATR. 

You'll also need to set a `riskPercentage` – this is the percentage of your account you’re willing to risk on each individual trade. 

Finally, the `atrMultiplier` controls how much the ATR influences the stop-loss distance, allowing you to fine-tune the sensitivity of your sizing based on market volatility.

## Interface ISizingParamsKelly

This interface defines the settings you can use when deciding how much to trade based on the Kelly Criterion. It helps you control the sizing of your trades within the backtest-kit framework. You're required to provide a logger, which is used to display helpful debugging information about your sizing decisions. Think of it as a way to keep track of why your trades are the size they are.

## Interface ISizingParamsFixedPercentage

This interface, `ISizingParamsFixedPercentage`, helps you define how much of your capital you're going to use for each trade when using a fixed percentage sizing strategy. Think of it as setting a rule – for example, "I always risk 2% of my account per trade."

It’s used when creating a `ClientSizing` object.

The key component is the `logger`, which allows you to easily track and debug what's happening with your sizing calculations. This helps you understand exactly how much capital is being allocated to each trade and spot any potential issues.


## Interface ISizingParamsATR

This interface, `ISizingParamsATR`, helps you define how much to trade based on the Average True Range (ATR) indicator. Think of it as a set of instructions for your trading system to determine position sizes. It includes a `logger` property, which allows you to track and debug what's happening as your system calculates these sizes, allowing you to see the decisions being made and troubleshoot any issues. By configuring these parameters, you can control risk management based on market volatility as measured by the ATR.

## Interface ISizingCallbacks

This interface provides a way to be notified when the backtest-kit calculates how much to trade. You can use the `onCalculate` property to hook into this process—think of it as a signal letting you know the calculated trade size and the parameters that influenced it. This is helpful for things like checking if the size makes sense based on your strategy or for keeping a record of the sizing decisions made during the backtest.

## Interface ISizingCalculateParamsKelly

This interface defines the information needed to calculate trade sizing using the Kelly Criterion. 

To use it, you're going to provide details about your strategy's historical performance. Specifically, you’ll need to specify the win rate – representing the percentage of winning trades – and the average win/loss ratio, which tells you how much you typically win compared to how much you lose on each trade. The `method` property confirms that you're using the Kelly Criterion for sizing.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the information needed to calculate trade sizes using a fixed percentage approach. It specifies that the sizing method used is "fixed-percentage".  You're also required to provide a `priceStopLoss`, which represents the price at which a stop-loss order will be triggered. This price is a crucial part of determining how much to trade based on your risk management strategy.

## Interface ISizingCalculateParamsBase

This interface defines the basic information needed to figure out how much to trade. It includes the symbol of the trading pair, like "BTCUSDT", the current amount of money in your account, and the price at which you intend to buy. Think of it as the foundation for calculating your trade size. It provides the essential data any sizing calculation needs to get started.

## Interface ISizingCalculateParamsATR

This interface defines the information needed when you're determining how much to trade based on the Average True Range (ATR).  Essentially, it tells the backtest kit that you want to size your trades using an ATR-based approach.  You'll provide the method as "atr-based" and then supply a numeric value representing the current ATR. This ATR value is a key input into the sizing calculation, helping to adjust position size relative to market volatility.

## Interface ISizing

The `ISizing` interface defines how your trading strategy determines the size of each position it takes. Think of it as the component that figures out *how much* to buy or sell, given your risk tolerance and other factors. 

It has a single crucial function, `calculate`. This function receives information about the current trading conditions – things like the amount of capital you’re willing to risk, the price of the asset, and your stop-loss levels. It then uses this information to return a number representing the calculated position size. The `calculate` function operates asynchronously and returns a promise that resolves to the position size.

## Interface ISignalRow

This interface, `ISignalRow`, represents a finalized trading signal ready for use within the backtest-kit framework. Think of it as the complete package – it holds all the crucial details needed to execute a trade. Each signal gets a unique ID, automatically created to keep everything organized. 

It contains information like the entry price (`priceOpen`), the exchange to use (`exchangeName`), and the specific trading strategy that generated it (`strategyName`).  You'll also find timestamps indicating when the signal was initially created (`scheduledAt`) and when the position became pending (`pendingAt`).  The `symbol` property tells you exactly which trading pair is involved (like "BTCUSDT"). Finally, there's an internal flag, `_isScheduled`, used by the system to track signals that have been scheduled.


## Interface ISignalDto

This data structure represents a trading signal, the kind of information used to make buy or sell decisions. It includes essential details like whether you’re going long (buying) or short (selling), the entry price, and where to set your take profit and stop-loss levels to manage risk and potential gains. A human-readable note lets you remember *why* you generated this signal. There’s also an estimated time in minutes until the signal expires.  If you don’t provide an ID when creating a signal, one will be automatically generated for you.

## Interface IScheduledSignalRow

This interface, `IScheduledSignalRow`, helps you manage signals that should trigger at a specific price in the future. Think of it as a signal that's "on hold" waiting for the market to reach a particular price level. It builds on the basic `ISignalRow` to add this delayed entry capability. 

When the market price matches the `priceOpen` value, this row transforms into a regular pending signal.  It also keeps track of when it was initially scheduled and, crucially, updates the `pendingAt` timestamp to reflect the actual moment it becomes active. This lets you see how long the signal was waiting before execution.



The `priceOpen` property simply defines that target price – the level the market needs to reach for the signal to activate.

## Interface IRiskValidationPayload

This interface, `IRiskValidationPayload`, is designed to hold all the information a risk validation function needs to make its decisions. Think of it as a package containing details about the trade you're considering. 

It builds upon the `IRiskCheckArgs` interface and adds crucial data about the current state of your portfolio. You'll find the `pendingSignal` – the trade you want to execute – included here, along with the total number of open positions (`activePositionCount`) and a detailed list of those active positions (`activePositions`). This allows risk checks to consider the impact of the new signal within the context of the existing portfolio.

## Interface IRiskValidationFn

This type defines a function used to check if your trading strategy's risk parameters are set up correctly. Think of it as a quality check before your backtest runs – it ensures things like your position size and leverage are within acceptable limits. The function takes the risk parameters as input and, if anything seems wrong or unsafe, it should raise an error to stop the backtest and alert you to the problem. It's a crucial part of making sure your backtesting is reliable and doesn’t lead to unrealistic or dangerous trading simulations.

## Interface IRiskValidation

This interface, `IRiskValidation`, helps you define how to check if your trading risks are acceptable. Think of it as a way to set rules for what's considered a safe level of risk.

It has two parts: `validate` and `note`.

The `validate` property is where you put the actual logic – a function that will examine your risk parameters and decide if they pass the test. It's the core of your risk validation.

The `note` property is just there for documentation. It lets you add a brief explanation of what this specific validation is supposed to do, which is really helpful for anyone looking at your code later.

## Interface IRiskSchema

This interface, `IRiskSchema`, lets you define how your trading portfolio manages risk. Think of it as a blueprint for setting up rules and checks to ensure your trades stay within acceptable boundaries. 

You're essentially creating custom risk profiles, each identified by a unique name.  You can also add a note to describe the purpose of the risk profile.

You can specify lifecycle event callbacks - these are functions that get triggered at key points, like when a trade is rejected or approved.

Most importantly, you define your actual risk logic through a list of `validations`.  These validations are the core of your risk controls, allowing you to implement specific checks and constraints on your portfolio's behavior.

## Interface IRiskParams

The `IRiskParams` interface defines the configuration settings you provide when setting up a risk management system within the backtest-kit framework. It's essentially a container for things like logging and a specific callback function to handle situations where trading signals are blocked due to risk constraints.

The `logger` property lets you connect a logging service to receive debug messages, useful for understanding what the risk system is doing.

The `onRejected` function is crucial: it gets called whenever a signal is rejected because it hits a risk limit. You can use this to record the rejection reason, potentially emit custom events, or perform other actions before the rejection is formally registered. It’s a chance to react to a blocked trade *before* it’s finalized.

## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, holds the information needed to determine if a new trade should be allowed. Think of it as a safety check performed before a trading signal is created. It provides details like the trading pair (symbol), the signal itself, the name of the strategy making the request, the exchange being used, the current price, and the current time. These arguments are simply passed along from the larger ClientStrategy context, allowing for fine-grained control over trade validation.

## Interface IRiskCallbacks

This interface provides a way to get notified when risk checks either pass or fail during trading simulations. 

If you want to know when a trading signal is blocked because it violates your risk parameters, you can implement the `onRejected` callback.  It will be triggered with the symbol and risk check arguments.

Conversely, if you want to be informed when a signal successfully passes your risk checks, the `onAllowed` callback lets you do just that, providing the symbol and risk check arguments for that approved signal. These callbacks help you monitor and understand how your risk rules are impacting trading decisions.

## Interface IRiskActivePosition

This interface, `IRiskActivePosition`, represents a single trading position being actively managed, and that the risk management system is tracking. It's used to give a complete picture of positions across different strategies and how they interact. 

Each `IRiskActivePosition` holds information like the signal that initiated the trade (`signal`), which strategy is responsible for it (`strategyName`), the exchange being used (`exchangeName`), and when the position was first opened (`openTimestamp`). Think of it as a snapshot of a trade that helps understand the bigger picture of your trading activity.

## Interface IRisk

The `IRisk` interface is all about keeping your trading safe and controlled. Think of it as a gatekeeper for your strategies, making sure they don't take on more risk than you're comfortable with. 

It has a method called `checkSignal` that you use to see if a potential trade aligns with your risk rules. You pass in details about the trade, and it tells you whether to proceed.

There are also methods for tracking your open and closed trades. `addSignal` lets you register when a new position is opened, and `removeSignal` lets you update that record when a position is closed. This helps keep track of overall risk exposure.


## Interface IPositionSizeKellyParams

This interface defines the settings you provide when calculating position sizes using the Kelly Criterion. It lets you specify how often your strategy wins (the win rate, a number between 0 and 1) and the average ratio of your winning trades compared to your losing trades (the win/loss ratio). Think of it as telling the framework how confident you are in your trading strategy so it can suggest an appropriate amount to risk on each trade. By providing these two values, the framework can help you determine a size that balances potential growth with risk management.

## Interface IPositionSizeFixedPercentageParams

This interface defines the parameters you'll use when calculating position sizes using a fixed percentage of your capital. It's designed for strategies where you want to consistently risk a set percentage of your available funds on each trade. 

The `priceStopLoss` property specifies the price at which your stop-loss order will be placed to limit potential losses. This value is crucial for determining the appropriate position size based on your risk tolerance.

## Interface IPositionSizeATRParams

This interface defines the parameters needed to calculate position sizing based on the Average True Range (ATR).  It’s a simple setup; you're primarily interested in the `atr` property, which represents the current ATR value. Think of this as the volatility indicator you’re using to determine how much capital you want to risk on a trade. Providing the ATR value allows the backtest kit to accurately calculate the size of your position.

## Interface IPersistBase

This interface defines the basic functions for saving and retrieving data. Think of it as the foundation for how your backtesting framework interacts with storage. 

It includes methods for ensuring the storage is ready, reading data based on an identifier, quickly checking if a piece of data exists, and for writing data persistently.  The `waitForInit` function sets everything up initially, making sure the storage is valid. The `readValue` and `hasValue` functions are for getting data. Finally, `writeValue` allows you to store your data reliably.

## Interface IPartialData

This interface, `IPartialData`, helps us save and load important data about a trading signal. Think of it as a snapshot of key information that can be stored and retrieved later.

Specifically, it holds information about the profit and loss levels that have been hit during trading. These levels are saved as arrays, which allows them to be easily stored in a way that can be saved and loaded.

The `profitLevels` property tracks the levels where the signal has made a profit, and `lossLevels` tracks where it has experienced losses. This is designed to be saved and reassembled later when you need to rebuild the full state of the trading signal.

## Interface IPartial

The `IPartial` interface helps track how much profit or loss a trading signal has achieved. It’s used by the system to monitor signals and notify users when certain milestones are hit, such as reaching 10%, 20%, or 30% profit or loss.

When a signal makes money, the `profit` method is called to evaluate its progress and announce any new profit levels reached. Similarly, the `loss` method handles situations where a signal is losing money, alerting when new loss levels are encountered. To avoid repeated announcements, the system keeps track of already announced levels and only sends notifications for unique progress.

Finally, when a signal closes – whether it hits a target, a stop-loss, or its time expires – the `clear` method is used to clean up the signal’s tracking information, removing it from memory and persisting the changes.

## Interface IOptimizerTemplate

The `IOptimizerTemplate` interface provides tools for creating code snippets and prompts used within the backtest-kit framework. It's designed to help build and configure the different components of a trading system, especially when integrating with Large Language Models (LLMs).

You can use methods like `getTopBanner` to produce the initial setup code, including necessary imports and variable initialization.  `getUserMessage` and `getAssistantMessage` are useful for crafting the initial conversations with an LLM, providing context for the trading system.

For configuring specific parts of your trading system, functions like `getWalkerTemplate`, `getExchangeTemplate`, `getFrameTemplate`, and `getStrategyTemplate` generate the appropriate code for each component. `getLauncherTemplate` creates the code to actually run the entire system and handle events.

Finally, `getTextTemplate` and `getJsonTemplate` create helper functions to control how the LLM generates text or structured JSON output, making it easier to work with the model's responses. The `getJsonDumpTemplate` provides a convenient way to create debug output for your trading symbols.

## Interface IOptimizerStrategy

This interface, `IOptimizerStrategy`, holds all the information about a trading strategy that was created using an AI model. It's like a complete record of how the strategy came to be.

You’ll find the trading symbol the strategy is designed for, a unique name to easily identify it, and a detailed history of the conversation with the AI model – including both your initial prompts and the AI’s responses.  Critically, it also contains the core strategy logic itself, the text output from the AI that defines how the system should trade. Think of it as the recipe for the trading approach.

## Interface IOptimizerSourceFn

The `IOptimizerSourceFn` is essentially a function that provides the data needed to train and optimize your trading strategies. Think of it as your data feed for backtesting. It's designed to handle large datasets efficiently through pagination, meaning it fetches data in smaller chunks rather than all at once.  A crucial requirement is that each piece of data it provides must have a unique identifier, allowing the backtest kit to track and process each data point individually. This function is the bridge between your data and the optimization process.

## Interface IOptimizerSource

This interface describes how your backtest data is brought in and presented to the AI for analysis. Think of it as defining where your data comes from and how it’s packaged for the LLM to understand.

You'll give it a unique name to identify the data source.

The `fetch` function is the core of this; it’s what actually retrieves the historical data, and it needs to be able to handle large datasets through pagination.

You can add a description using the `note` property to provide context.

If you want more control over how the messages look, you can provide custom formatters for the “user” and “assistant” roles – otherwise, the system will use its built-in defaults.

## Interface IOptimizerSchema

This interface outlines the structure for configuring how backtest-kit optimizes trading strategies. Think of it as a blueprint for setting up an optimizer, defining where it gets its data, how it creates strategies, and how it evaluates their performance.

You'll use `rangeTrain` to specify different periods of historical data used to generate and compare different strategy versions – essentially, training multiple strategies on slightly different data. `rangeTest` then designates the timeframe for assessing the final strategies generated.

`source` tells the optimizer where to pull the data needed for the process. `getPrompt` is the key function responsible for assembling the prompt sent to the LLM to generate the strategy based on the gathered context.

You can further customize the optimizer's behavior through `template` to alter how it functions, or add `callbacks` to track its progress. `note` provides a simple way to add a description for clarity. Finally, `optimizerName` gives the optimizer a unique identifier for easy reference.

## Interface IOptimizerRange

This interface, `IOptimizerRange`, helps you define specific time periods for backtesting and optimizing your trading strategies. Think of it as setting the boundaries for the data your system will learn from or evaluate. You specify a `startDate` and `endDate` – both dates are included in the range. Optionally, you can add a `note` to describe the purpose of this time range, like labeling it as a “bear market” or a “testing phase”.

## Interface IOptimizerParams

This interface defines the settings needed to set up the core optimization engine. It ensures that the engine has access to a logging mechanism for tracking its progress and a complete, ready-to-use template for defining trading strategies and backtesting configurations. Think of the logger as a way to see what's happening behind the scenes, and the template as the blueprint for your trading experiments. The template combines your custom settings with some default behaviors to provide a full set of tools.

## Interface IOptimizerFilterArgs

This interface defines the information needed to select a specific set of data for backtesting. It allows you to specify which trading pair, represented by its symbol like "BTCUSDT," you're interested in, and the starting and ending dates for the historical data you want to use. Think of it as telling the system, "I need data for this specific currency pair, from this date to that date." It's a simple way to narrow down the data used in your backtesting simulations.

## Interface IOptimizerFetchArgs

This interface defines the information needed when fetching data for optimization, particularly when dealing with large datasets that need to be retrieved in smaller chunks. Think of it like asking for a specific slice of your data – the `limit` specifies how many items you want in that slice, and the `offset` tells you where to start retrieving from the beginning of your data.  The default is to get 25 items at a time, but you can adjust those numbers to suit your needs. This is essential for efficient backtesting and optimization processes.

## Interface IOptimizerData

This interface defines the basic structure for data used when optimizing trading strategies. Every piece of data you feed into the optimization process needs a unique identifier – think of it like a serial number – so the system can keep track of it and avoid duplicates, especially when dealing with large datasets fetched in chunks. This ID is crucial for ensuring accurate and reliable optimization results.

## Interface IOptimizerCallbacks

This interface lets you tap into key moments during the optimization process. Think of it as a way to keep an eye on what's happening and make sure everything's working as expected. 

You can use `onData` to check the strategy data that’s been created, for example, to ensure it looks reasonable.  `onCode` allows you to observe the generated strategy code itself, perhaps for debugging or logging.  If you're saving the code to a file, `onDump` gives you a signal when that's finished. Finally, `onSourceData` alerts you when data has been pulled from a data source, letting you confirm its integrity and range.

## Interface IOptimizer

The Optimizer interface lets you work with backtest-kit to create and export trading strategies. You can use it to pull together data and build a basic understanding of how a strategy might perform. The `getData` method gathers information and generates strategy details based on the symbol you specify. Then, `getCode` takes that data and crafts a complete, runnable code file for your strategy. Finally, `dump` lets you save that generated code directly to a file on your system, so you can easily use and deploy it.

## Interface IMethodContext

This interface, `IMethodContext`, acts like a little helper, carrying essential information about which parts of your backtesting system should be used for a particular operation. Think of it as a way to tell the system, "Hey, I need to use the strategy defined as 'MyStrategy', running on the 'Binance' exchange, and using the 'Daily' frame."  It holds the names of the strategy, exchange, and frame currently in use. This context is automatically passed around by the system, so you don't have to manually track which components are being used. The frame name will be empty when running in live mode, indicating that no specific frame data is involved.


## Interface ILogger

The `ILogger` interface provides a standard way for different parts of the backtest-kit framework to record information about what's happening. Think of it as a central place to capture events and details during a backtest run.

You can use it to create general log messages to track important events, or more detailed "debug" messages to help understand complex operations. "Info" messages provide a good overview of successful actions, while "warn" messages highlight potential issues that you might want to investigate. Each component, like agents, sessions, or storage, can use the logger to provide insights into its behavior and help with troubleshooting.

## Interface IHeatmapStatistics

This interface describes the aggregated statistics you'd see when visualizing your portfolio's performance as a heatmap. It provides a consolidated view of how all your assets are doing. 

You’ll find an array of individual symbol statistics – each representing a single asset in your portfolio – stored within the `symbols` property. The `totalSymbols` property simply tells you how many assets are included in this overview. 

Beyond individual symbol details, you're also provided with key portfolio-level metrics like total profit and loss (`portfolioTotalPnl`), a Sharpe Ratio for the entire portfolio (`portfolioSharpeRatio`), and the total number of trades executed across all assets (`portfolioTotalTrades`). This structure is designed to give you a quick and insightful look at your portfolio's overall health and performance.

## Interface IHeatmapRow

This interface represents the performance data for a single trading symbol, like BTCUSDT. It bundles together key statistics calculated across all strategies used for that particular symbol.

You'll find essential metrics here to understand how a symbol performed, including total profit or loss, risk-adjusted return (Sharpe Ratio), and the largest drop in value experienced (maximum drawdown).

It also includes a breakdown of trading activity, like the total number of trades, how many were wins versus losses, and the average profit or loss per trade.  Further analysis is available through metrics such as win rate, profit factor, and streak information. Expectancy is also provided, indicating potential long-term profitability.

## Interface IFrameSchema

The `IFrameSchema` defines how your backtest will generate timestamps and organize its data. Think of it as setting the ground rules for your trading simulation’s timeline. 

You're essentially specifying the start and end dates of your backtest period, as well as the interval at which data will be generated – for instance, daily, hourly, or even minute-by-minute.  Each schema needs a unique name to identify it within your backtest kit. 

It’s possible to add a note to describe the purpose of the schema for your own records or to share with other developers. Finally, you can optionally include lifecycle callbacks for more advanced customization and control.

## Interface IFrameParams

The `IFramesParams` interface defines the information needed to set up a client frame within the backtest-kit framework. Think of it as a configuration object; it holds settings for how the client frame will operate. Crucially, it includes a `logger`, which is a tool for tracking and diagnosing what’s happening inside the frame – you can use it to get detailed insights into the frame’s activities. The `IFramesParams` interface builds upon the `IFramesSchema`, adding this logging capability for easier debugging and monitoring.

## Interface IFrameCallbacks

The `IFrameCallbacks` interface lets you hook into key moments in how backtest-kit sets up the time periods for your trading simulation. Specifically, you can use the `onTimeframe` callback to be notified when a new set of timeframes has been created. This is a helpful spot to keep an eye on the dates being used, perhaps to double-check they align with your expectations or to record this information for auditing purposes. You’re essentially getting a notification when the framework determines the specific dates and intervals it’s going to use for your backtest.

## Interface IFrame

The `IFrame` interface helps generate the timeline your backtest will run on. It's a core piece of how backtest-kit organizes and executes trading simulations.

The key method, `getTimeframe`, takes a symbol (like 'AAPL') and a frame name (like '1m' for one-minute intervals) and returns a promise that resolves to an array of dates.  These dates represent the specific points in time your backtest will analyze. Think of it as creating the calendar for your trading simulation.

## Interface IExecutionContext

The `IExecutionContext` interface holds important information about the current trading environment. Think of it as a little package of details that gets passed around to tell your strategy and exchange components what's happening.

It includes the trading symbol, like "BTCUSDT," so everyone knows which asset they're dealing with.  It also provides the current timestamp, which is crucial for accurately ordering events. Finally, it specifies whether the system is running a backtest – a simulation of past market data – or operating in a live trading environment. This allows your code to behave differently depending on the situation.

## Interface IExchangeSchema

This interface describes how backtest-kit connects to different data sources, like cryptocurrency exchanges or stock brokers. When you want to use a specific exchange, you're essentially telling backtest-kit where to get historical price data and how to handle quantities and prices according to that exchange’s rules.

The `exchangeName` acts as a unique identifier for the exchange you’re registering. You can also add a `note` for yourself to remember details about the exchange setup.

The crucial part is `getCandles`, which tells backtest-kit how to retrieve the actual price data – you provide a function that takes a symbol (like BTC/USDT), a time interval (like 1 hour), a start date, and a limit on the number of candles to retrieve. 

`formatQuantity` and `formatPrice` ensure your trading logic correctly handles the precision rules of each exchange. Finally, you can optionally define `callbacks` to react to specific events happening during the data retrieval process.

## Interface IExchangeParams

The `IExchangeParams` interface defines the information you provide when setting up an exchange within the backtest-kit framework. It’s essentially a blueprint for how your exchange will operate during a backtest.

It requires a `logger` which is used for providing helpful debugging messages and understanding what’s happening during your backtest. 

You also need to pass in an `execution` object. This object contains the `context`, which carries vital information like the trading symbol, the specific time period being analyzed, and whether the test is a backtest or a live execution.

## Interface IExchangeCallbacks

This section describes callbacks you can use to react to events happening within the trading framework, specifically those related to exchange data. One important callback is `onCandleData`, which gets triggered whenever the system retrieves new candlestick data. You’re given the symbol, the time interval of the candles (like 1 minute or 1 day), the starting date and limit, and an array of candlestick data points – allowing you to respond to incoming price information.


## Interface IExchange

The `IExchange` interface defines how backtest-kit interacts with simulated exchanges. It allows you to retrieve historical and future candle data, essential for simulating trading strategies. You can request a specific number of candles for a given symbol and time interval. 

The interface also provides utilities for formatting trade quantities and prices to match the exchange's requirements.  Finally, it includes a convenient method to calculate the Volume Weighted Average Price (VWAP) based on recent trading activity, helping to understand price trends.

## Interface IEntity

This interface, IEntity, serves as the foundation for all data objects that are saved and retrieved from storage within the backtest-kit framework. Think of it as a common starting point ensuring consistency across different data types like trades, orders, or account snapshots. Any class implementing IEntity guarantees it has a unique identifier, allowing for easy tracking and management within the backtest environment. It’s a core piece of the data architecture, simplifying how different components interact with persistent data.

## Interface ICandleData

This interface describes a single candlestick, which is a common way to represent price data over a specific time period. Each candlestick holds information about the opening price, the highest price reached, the lowest price seen, the closing price, and the volume traded during that timeframe. The `timestamp` property tells you precisely when this period began, measured as milliseconds since a specific epoch. This data is fundamental for building and testing trading strategies, particularly when calculating things like Volume Weighted Average Price (VWAP).

## Interface DoneContract

This interface signals when a background task, either a backtest or a live trading execution, has finished running. It’s essentially a notification that a process has completed. You’ll receive this notification when using `Live.background()` or `Backtest.background()`. The information provided includes the exchange used, the name of the trading strategy that ran, whether it was a backtest or a live execution, and the trading symbol involved. It's helpful for knowing when to proceed with subsequent actions after a background task concludes.

## Interface BacktestStatistics

This interface holds all the key statistics generated after running a backtest. It provides a detailed overview of how your trading strategy performed.

You'll find a complete list of closed trades, including their prices, profits, and timestamps, within the `signalList` property. The total number of trades is readily available in `totalSignals`.

Several key performance indicators are included, such as the number of winning and losing trades (`winCount`, `lossCount`), the percentage of winning trades (`winRate`), and the average profit per trade (`avgPnl`). The cumulative profit across all trades is presented as `totalPnl`.

To assess risk, you're given the `stdDev` (a measure of volatility) and the `Sharpe Ratio` and `annualizedSharpeRatio` which combine profit and risk.  A `certaintyRatio` highlights the relationship between average wins and losses, while `expectedYearlyReturns` provides an estimated annual return based on trade duration and profit. All numeric values are carefully monitored, and will be null if the calculations couldn's be safely performed.
