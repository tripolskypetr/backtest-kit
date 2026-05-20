---
title: private/functions
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


# backtest-kit functions

## Function writeMemory

The `writeMemory` function lets you store data persistently within your trading strategy. Think of it as writing information to a specific "bucket" or container identified by a name and a unique ID. You provide the data you want to store (which can be any object), a descriptive label for what that data represents, and the function takes care of saving it. It cleverly handles whether it's running in a backtest or live trading environment, so you don’t need to worry about that. The function works directly with the active trading signal to ensure data is associated correctly.


## Function warmCandles

This function helps prepare your backtesting environment by pre-loading historical candle data. It essentially downloads and stores candles for a specific time period, which speeds up the actual backtesting process because it avoids repeated downloads. You provide the start and end dates (from and to) and the candle interval, and the function takes care of fetching and caching all the required data. Think of it as a way to prime the pump before you begin running your trading strategies. It's particularly useful for longer backtesting periods or when using less common candle intervals.

## Function waitForReady

This function ensures your trading environment is fully prepared before you begin. It waits for essential components – the registries for exchanges, trading strategies, and historical data frames – to be loaded. 

Essentially, it's a safety check at startup. 

For backtesting, it confirms that everything is loaded (exchange, strategy, and data frames). In live trading, it only requires the exchange and strategy registries.

The function pauses and checks these registries every second, up to a maximum waiting time. If the registries aren’t ready within that time, it doesn’t throw an error directly; instead, it allows the subsequent trading attempt to fail with a more specific error message. This allows you to know what's missing and why your system can't start. You can control whether it waits for data frame registries using the `isBacktest` parameter.

## Function validate

The `validate` function is your safety check before running any tests or optimizations. It makes sure all the things your strategy relies on – like exchanges, frames, and sizing methods – are actually set up correctly. 

You can tell it specifically which items to check, or let it check everything to be really thorough. 

It’s a quick way to avoid unexpected errors later on by verifying that all your entities are properly registered in the system. Think of it as a pre-flight check for your trading setup.


## Function stopStrategy

This function lets you halt a trading strategy. It effectively pauses the strategy's ability to create new signals. Any existing, active signals will finish their process normally, but no new ones will be started. The system will then gracefully stop either when it’s idle or when an existing signal concludes, adapting to whether it’s running a backtest or a live trading session. You specify which strategy to stop by providing the trading symbol, like 'BTCUSDT'.

## Function shutdown

The `shutdown` function provides a way to safely end the backtest process. It signals to all parts of the testing framework that it's time to wrap things up. This lets components handle any final tasks, like saving data or closing connections, before the program finishes. It’s often used when you need to stop the backtest because of an interruption signal.


## Function setSignalState

This function allows you to update a specific piece of data, linked to a particular trading signal. 

It automatically handles the context of whether you're in a backtest or live trading environment.

The function is designed to work well with sophisticated strategies that track metrics over time, like how long a trade is open and its highest gain. It's particularly useful when you're using AI (like an LLM) to guide your trading decisions and want to record detailed information about each trade. 

It makes sure to deal with any pending signals and if there aren't any, it will let you know with a warning. You provide the symbol of the trading pair, a way to send the data (a dispatcher), and an object containing the name of the data bucket and the initial value for that data. The function then promises to return the updated value.

## Function setSessionData

This function lets you store information that's tied to a specific trading pair, strategy, exchange, and timeframe. Think of it as a way to remember something across different candles during a backtest or even keep it alive if your program restarts while running live.

You can use it to hold onto things like results from complex calculations or the state of an indicator you're using. 

If you want to forget the information, simply pass `null` as the value. The framework automatically adjusts its behavior whether you're running a backtest or live trading. 

You provide the symbol of the trading pair and the data you want to store, which can be any object or `null` to remove the existing data.

## Function setLogger

You can now provide your own logging system to the backtest-kit framework. This lets you control where and how log messages are displayed. The framework will automatically add useful context to each log entry, like the trading strategy name, the exchange used, and the symbol being traded, so you have all the details you need. Simply provide an object that conforms to the `ILogger` interface to configure your custom logging.

## Function setConfig

The `setConfig` function lets you adjust how the backtest-kit framework operates. You can provide a set of new settings, and it will update the framework's global configuration. Think of it as tweaking the framework's internal gears to fine-tune its behavior.  If you're running tests, you might need to use the `_unsafe` flag to bypass some of the validation checks, which is common in test environments. This function is fundamental for tailoring the framework to your specific backtesting needs.

## Function setColumns

This function lets you customize the columns displayed in your backtest reports, making them more tailored to your specific needs. You can modify existing column configurations or add new ones to control what information is presented. It's like personalizing the layout of your trading report.

The `columns` parameter accepts a partial configuration, allowing you to change only the parts you want. 

For advanced usage, like in a testing environment, there’s an optional `_unsafe` flag that bypasses the validation checks – use this carefully!


## Function searchMemory

The `searchMemory` function lets you find related data stored in your memory system. Think of it as a powerful search tool for retrieving information linked to a specific signal.

It uses a technique called BM25 to rank the relevance of your memory entries, ensuring the most important ones show up first.

The function intelligently figures out whether it’s running in a backtest or a live trading environment based on the execution context. 

You need to provide a bucket name to specify where to look for the data and a search query to define what you're looking for. It returns a list of found memory entries, each with a unique ID, a relevance score, and the actual content.


## Function runInMockContext

This function allows you to execute code within a simulated trading environment, perfect for testing or quick scripting tasks. It essentially sets up a temporary context to mimic how your code would behave during a backtest or live trading session.

You can customize this context by specifying details like the exchange, strategy, symbol, and whether it’s a backtest or live mode. However, if you don't provide these details, it uses default values for a basic live-mode scenario. This is especially helpful when you need to access elements like the current timeframe without needing a complete backtest setup. 

The `run` parameter is the function you want to execute inside this simulated environment.


## Function removeMemory

This function lets you delete a specific memory record associated with a signal. Think of it as cleaning up old data that's no longer needed.

It's designed to work seamlessly whether you're testing strategies (backtesting) or running them live, as it automatically adapts to the environment.

You provide the function with the name of the bucket where the memory is stored and the unique identifier of the memory entry you want to remove. 

Essentially, it handles the technical details of removing the memory, so you don't have to worry about them.


## Function readMemory

The `readMemory` function lets you retrieve data stored in a specific memory location. Think of it as accessing a named container holding information relevant to your trading strategy.

You specify which memory container you want to read from using `bucketName` and `memoryId`.

It automatically figures out whether you're in a backtesting environment or a live trading situation, and uses the correct signal context.

The function returns a promise that resolves to the data stored in that memory location, expecting it to be an object of a defined type.


## Function overrideWalkerSchema

This function lets you modify an existing walker configuration, which is how backtest-kit compares different trading strategies. Think of it as making targeted adjustments to a previously defined strategy setup. You provide a partial configuration – just the pieces you want to change – and the function updates the original walker, leaving the rest of its settings untouched. It's a handy way to experiment with small tweaks to a strategy without rebuilding it from scratch.

## Function overrideStrategySchema

This function lets you modify a trading strategy that's already set up within the backtest-kit framework. Think of it as a way to tweak an existing strategy without having to rebuild it from scratch.  You provide a portion of the strategy's configuration, and only those specific settings will be changed – the rest of the strategy's settings stay exactly as they were. It's useful for making small adjustments or updates to strategies without a complete overhaul. The function returns a promise that resolves to the updated strategy schema.


## Function overrideSizingSchema

This function lets you tweak how your trading positions are sized within the backtest-kit framework. Think of it as a way to fine-tune an existing sizing strategy, not replace it entirely. You can selectively adjust specific parts of the sizing configuration, leaving the rest of the original settings untouched. It’s useful for making small adjustments or overriding just a few parameters without rewriting the whole sizing scheme. The provided configuration object should contain only the elements you want to change.

## Function overrideRiskSchema

This function lets you adjust an existing risk management setup within the backtest-kit framework. Think of it as fine-tuning a pre-existing risk profile—you’re not starting from scratch.

It allows you to specify only the settings you want to change, leaving the rest of the original configuration untouched. This is useful for making targeted adjustments without redefining the entire risk management system.

You provide a partial configuration object as input, and the framework updates the existing risk profile based on that input.


## Function overrideFrameSchema

This function lets you adjust how data is structured for a specific timeframe during backtesting. Think of it as a way to fine-tune the data you're using to evaluate your trading strategies.  You can modify specific aspects of a timeframe’s configuration, like how data is calculated or presented, without completely replacing the original setup. It’s particularly useful when you need to make minor tweaks or corrections to an existing timeframe’s definition. Only the properties you provide in the input will be changed; the rest of the timeframe's configuration stays as it was.

## Function overrideExchangeSchema

This function lets you modify an existing exchange's data source within the backtest-kit framework. Think of it as a way to tweak a connection to a specific exchange without completely rebuilding it.

You can selectively update parts of the exchange's configuration, like its data feed settings or API keys. The function takes a partial exchange schema as input – only the fields you provide will be changed; everything else will stay the same. It’s handy for making small adjustments or corrections without impacting the rest of your setup. The function returns a promise that resolves to the updated exchange schema.


## Function overrideActionSchema

This function lets you tweak existing action handlers within the backtest-kit framework. Think of it as making small adjustments to how your trading actions behave—like changing a callback function—without having to completely re-register the handler from scratch. 

You can use it to modify things like the logic for handling events, adapt callbacks to work differently in development versus production, swap out different implementations of a handler, or fine-tune action behavior without needing to alter your core strategy.  It only updates the parts you specify, leaving everything else untouched.


## Function listenWalkerProgress

This function lets you keep an eye on how a backtest is progressing, especially when running multiple strategies. It provides updates after each strategy finishes its run within the backtest.  

Importantly, the updates are delivered one at a time, even if the function you provide to handle them takes some time to complete.  This prevents things from getting out of sync and ensures a smooth monitoring experience.

To use it, you give it a function that will be called for each progress event. The function you provide can then do whatever you need with that information, like updating a UI or logging progress.  When you're done listening for progress updates, the function returns another function you can call to unsubscribe and stop receiving updates.


## Function listenWalkerOnce

`listenWalkerOnce` lets you watch for specific events happening during a trading simulation, but only once. 

It takes a rule (the `filterFn`) to determine which events you're interested in. 

Then, it provides a function (`fn`) to execute when a matching event occurs.

Once that event is found and the function is run, the listener automatically stops listening – it’s perfect for scenarios where you need to react to something happening just once. 

Essentially, it's a temporary event listener that cleans up after itself.

## Function listenWalkerComplete

This function allows you to be notified when the backtest walker finishes processing all of your strategies. Think of it as a signal that all your tests are done. Importantly, any code you put inside your notification function will run one step at a time, guaranteeing order and preventing issues if your code takes some time to execute. You provide a function that will be called when the walker is complete, and this function will return another function that you can use to unsubscribe from those notifications later.


## Function listenWalker

The `listenWalker` function lets you track the progress of a trading strategy backtest. It provides a way to receive notifications after each strategy finishes running within a backtest.

These notifications are delivered in the order they occur, and the processing of each notification is handled in a sequential manner, preventing any conflicts that could arise from multiple operations happening at once.

You provide a function (`fn`) that will be called with details about each strategy's completion, allowing you to respond to these events as needed. When you're done listening, the function returns another function that you can use to unsubscribe from the progress events.

## Function listenValidation

This function lets you keep an eye on any problems that pop up during risk validation checks. It will notify you whenever a validation check encounters an error. Think of it as a way to catch and debug potential issues as they happen. The errors are delivered one at a time, even if your error handling code takes some time to run, ensuring a predictable processing order.

## Function listenSyncOnce

This function lets you subscribe to synchronization events, but with a twist: it only runs your callback function *once* when a specific event condition is met. Think of it as a one-shot listener for signals. 

It's especially handy when you need to coordinate your trading logic with external systems that operate asynchronously. The framework will pause other operations like opening or closing positions until your callback function finishes executing, ensuring everything stays synchronized.

You define what events you're interested in with a `filterFn` – a function that determines if an event should trigger the callback.  The `fn` is the function that will be called when a matching event occurs, and it can even be an asynchronous function – the framework will wait for it to complete.


## Function listenSync

The `listenSync` function lets you react to signals that require extra coordination, like when you're connecting your trading system to something else. It lets you define a function that will be called whenever a signal needs to be synchronized, and any promises returned by that function will block the opening or closing of positions until they are resolved. This is particularly helpful for ensuring smooth interactions with external systems or for handling complex signal processing steps. You can use it to keep everything in sync during your trading operations.


## Function listenStrategyCommitOnce

This function lets you react to specific changes happening within your trading strategy, but only once. Think of it as setting up a temporary alert – it listens for a particular event, triggers your code when it happens, and then quietly stops listening. It's perfect for situations where you need to respond to an event just once, like confirming a strategy update or handling a one-time initialization task.

You provide a filter to specify what kind of event you're interested in, and then a function that will run when that event occurs. Once the event is triggered and your function executes, the listening stops automatically. This is a neat way to handle temporary needs without cluttering up your ongoing processes.


## Function listenStrategyCommit

This function lets you keep an eye on what's happening with your trading strategies. It provides a way to react to specific events like signals being canceled, orders being closed for profit or loss, and adjustments to stop-loss and take-profit levels. Think of it as a notification system that ensures events are processed one after another, even if your reaction to them involves asynchronous operations. You give it a function that will be called whenever one of these events occurs, allowing your code to respond accordingly. Importantly, this ensures that the event handling is done safely and in the right order.


## Function listenSignalOnce

This function lets you temporarily listen for specific trading signals. You provide a rule (the `filterFn`) that defines what kind of signal you're interested in. It then executes a callback function (`fn`) once a signal matches that rule. Once the callback runs, the listener automatically stops, so you don't have to worry about manually cleaning up. Think of it as a way to react to a specific event and then forget about it. It's helpful for actions that only need to happen once based on a certain market condition.

## Function listenSignalNotifyOnce

This function lets you quickly react to a specific type of trading signal. You provide a condition – a filter – that describes the signals you're interested in. Once a signal matches that condition, a provided function will be executed just once to handle it, and then the subscription is automatically removed. It’s great for one-off actions like confirming an order or logging a specific signal without needing to manage subscriptions yourself.


## Function listenSignalNotify

This function lets you keep track of user-defined notes related to open positions within your backtest. Whenever a strategy sends a signal notification – essentially a note about a position – this function will notify your callback. 

The notifications are handled in the order they're received, and even if your callback function does some asynchronous processing, it won't interrupt the sequence of notifications. This ensures a reliable and orderly stream of updates.

You provide a function that will be called with each new signal notification. The function you provide will receive information about the signal, allowing you to react accordingly.

The function returns an unsubscribe function that you can use to stop receiving signal notifications.


## Function listenSignalLiveOnce

This function allows you to react to specific trading signals as they come in from a live, running strategy. It's designed to be a quick way to catch one particular signal and then automatically stop listening. You provide a filter – a way to choose which signals you’re interested in – and a function to execute when a matching signal arrives. Think of it as setting up a temporary alert that goes off once and then disappears. It only works with signals generated during a Live.run() execution.


## Function listenSignalLive

This function lets you tap into a stream of real-time trading signals generated by a live backtest execution. Think of it as setting up a listener to receive updates as the backtest is actively running.  Importantly, this only works when using `Live.run()`.

The `fn` you provide is the function that will be called whenever a new signal event arrives.  The events are handled one at a time, ensuring they’re processed in the order they were received. It's like getting a queue of trading updates you can process.

The function returns another function that you can use to unsubscribe from these live updates. This is important for cleaning up when you no longer need to listen.


## Function listenSignalBacktestOnce

This function allows you to temporarily listen for specific signals generated during a backtest run. Think of it as setting up a short-term alert that triggers just once when a certain condition is met. It's designed to be used during a `Backtest.run()` execution and automatically stops listening after the callback function has been executed once. You provide a filter to define which signals you're interested in, and then a function that will be called only when a matching signal arrives. Once that function runs, the listener is automatically removed, ensuring it doesn't interfere with other parts of your process.

Here's a breakdown:

*   You tell it which signals you want to observe using a filter.
*   You specify what should happen when a matching signal comes through.
*   The function ensures this action happens only once and then stops listening.


## Function listenSignalBacktest

This function lets you hook into the backtest process and receive updates as it runs. Think of it as setting up a listener that gets notified whenever the backtest generates a signal.

You provide a function that will be called with each signal.

This listener is specifically for signals generated during a `Backtest.run()` execution, ensuring you only receive data relevant to the active backtest.  The signals are delivered one after another, guaranteeing order. When you’re done listening, the function returns another function which you can call to unsubscribe.

## Function listenSignal

This function lets you react to events generated by your trading strategy, like when a position is opened, active, or closed.  Think of it as setting up a listener that gets notified whenever something important happens with your strategy's trades. The listener processes these events one at a time, even if the code you provide to handle them takes some time to run, ensuring that things happen in the correct order. You simply provide a function that will be called with the details of each event, and this function returns another function you can call to stop listening.

## Function listenSchedulePingOnce

This function helps you react to specific "ping" events within the backtest-kit system, but only once. Think of it as setting up a temporary listener that waits for a particular condition to be met.

You provide a filter to identify the exact events you’re interested in, and a function to execute when that event appears.

Once the event is processed, the listener automatically disappears, ensuring it doesn't interfere with other parts of your backtesting logic. It’s a clean way to handle single, time-sensitive reactions to events during your backtest.


## Function listenSchedulePing

The `listenSchedulePing` function lets you keep an eye on scheduled signals as they wait to become active. It's like setting up a little listener that gets notified every minute while a scheduled signal is being monitored. You provide a function, and this function gets called each time a "ping" event is triggered, giving you a chance to track the signal's progress or perform custom checks.  This provides a way to understand the lifecycle of scheduled signals and handle specific monitoring tasks. When you’re finished, the function returns another function that you can call to unsubscribe from these ping events.

## Function listenRiskOnce

`listenRiskOnce` lets you react to specific risk-related events just once and then automatically stop listening. Think of it as setting up a temporary alert – it triggers your code when a certain condition is met (defined by `filterFn`), executes your provided function (`fn`), and then quietly goes away, preventing further interruptions. This is really handy when you need to wait for a particular risk rejection scenario to happen and then take action, without continuously monitoring. You provide a function that checks if the event is what you’re looking for, and another function that handles the event once it's found. The function returned by `listenRiskOnce` can be called to manually unsubscribe from the events if needed.

## Function listenRisk

This function allows you to monitor and react to situations where a trading signal is blocked because it doesn't meet the defined risk criteria. 

It’s a way to be notified *only* when a signal is rejected – meaning it won’t flood you with updates about signals that are perfectly acceptable.

The events are handled in the order they arrive, and there's a built-in mechanism to ensure they are processed one at a time, even if your response involves asynchronous operations.

You provide a function (`fn`) that gets executed whenever a risk rejection occurs; this function will receive information about the specific rejected signal. The function you provide will also return a function that, when called, unsubscribes from these risk rejection events.

## Function listenPerformance

This function lets you keep an eye on how your trading strategies are performing, specifically focusing on timing. It's like having a detective that reports on how long different parts of your strategy take to execute.

You provide a function that gets called whenever a performance event occurs – this is your detective’s notebook where you record observations.

These events are delivered one at a time, even if your notebook-taking function needs some extra time to write down the details. This ensures a reliable record without things getting jumbled.

Essentially, it’s a way to profile your strategies, pinpoint slow areas, and ultimately optimize for faster and more efficient trading. You can unsubscribe at any time to stop receiving these performance updates.

## Function listenPartialProfitAvailableOnce

This function helps you react to specific profit milestones during a trade, but only once. It lets you define a condition – perhaps a certain percentage of profit achieved – and a function to execute when that condition is met.  Once the condition is true and your function runs, the listener automatically stops, preventing repeated actions. Think of it as a "one-time alert" for a particular profit level. You provide a way to identify the events you’re interested in and then the action you want to take when one of those events occurs.

## Function listenPartialProfitAvailable

This function lets you be notified when your trades hit certain profit milestones, like 10%, 20%, or 30% gains. It ensures that these notifications happen one at a time, even if the process of handling each notification takes some time. You provide a function that will be called whenever a partial profit milestone is reached, and this function will receive information about the trade that achieved that milestone. You can unsubscribe from these notifications whenever you need to stop receiving them.

## Function listenPartialLossAvailableOnce

This function allows you to react to specific changes in partial loss levels, but only once. Think of it as setting up a temporary alert – it listens for an event that meets your criteria, triggers a function to handle it, and then stops listening. This is helpful when you need to respond to a particular loss scenario and don't want to be bothered by future occurrences. You provide a filter to specify which events you're interested in, and a function to execute when that event happens. Once the event is handled, the listening stops automatically.


## Function listenPartialLossAvailable

This function lets you set up a listener that gets notified when a trading strategy experiences a specific level of loss, like 10%, 20%, or 30% of its initial capital.

It’s designed to make sure these notifications happen in the order they're received and that your callback function – even if it takes a little time to run – doesn't interfere with other operations. Think of it as a way to react to loss milestones without worrying about timing issues.

You provide a function as input, and this function will be called whenever a loss milestone is reached.  Importantly, the system handles the order and queuing of these calls for you.

The function itself returns another function that you can call to unsubscribe from these notifications.


## Function listenMaxDrawdownOnce

This function lets you watch for specific maximum drawdown events and react to them just once. It's like setting up a temporary alert—you tell it what kind of drawdown you’re looking for, provide a function to run when it happens, and then it automatically stops listening after that one event. This is really handy if you need to take action only when a particular drawdown condition is met, and you don’t want to continuously monitor.

You'll define a filter, essentially a rule that determines which drawdown events are relevant to your action. 

Then, you specify a function that will be executed whenever an event passes this filter. 

The function will automatically stop listening once the condition is met and the callback is triggered.

## Function listenMaxDrawdown

This function lets you monitor a trading strategy's maximum drawdown – the largest peak-to-trough decline during its operation. It's like setting up an alert that triggers whenever the drawdown hits a new high.

The system will notify you whenever a new maximum drawdown is reached, ensuring that your response to these events happens one after another, even if your alert function takes some time to complete. This is helpful for tasks like adjusting stop-loss orders or implementing other reactive risk management strategies.

You provide a function that will be called each time a new maximum drawdown event occurs, allowing you to react to these significant changes in the strategy's performance. The subscription can be canceled at any time by returning the function returned by `listenMaxDrawdown`.

## Function listenIdlePingOnce

This function lets you react to idle ping events, but with a special twist: it only runs your code once for the first event that matches your criteria. You provide a function (`filterFn`) that determines which idle ping events you're interested in.  Then, you give it a callback function (`fn`) that will be executed just once when an event passes the filter.  After that, the subscription is automatically cancelled. This is handy for one-off tasks triggered by idle signals. Finally, this function returns a function which you can call to unsubscribe.


## Function listenIdlePing

This function allows you to be notified when the backtest kit isn't actively processing any trading signals. Think of it as a way to detect periods of inactivity.

It subscribes you to events that are triggered when there are no signals currently being monitored or scheduled.

You provide a callback function that will be executed whenever an idle ping event occurs, and this function will receive data about the event through the `IdlePingContract` type. 

The function returns an unsubscribe function, which you can use to stop receiving these idle ping notifications later.


## Function listenHighestProfitOnce

This function allows you to temporarily watch for events indicating the highest profit achieved, but only react to the first one that meets your criteria. You provide a rule—a filter—to define what kind of profit event you're interested in. Once an event matches your rule, the function will execute your provided callback function, and then automatically stop listening. Think of it as setting up a temporary alert for a specific profit target, and then forgetting about it once that target is hit. This is particularly helpful when you need to respond to a single, specific profit event and don’t want to keep monitoring indefinitely. 

The `filterFn` lets you define exactly which events you want to be notified about.

The `fn` is the action taken once a matching event is found.


## Function listenHighestProfit

This function lets you be notified whenever a trading strategy achieves a new peak profit. 

Think of it as a way to keep an eye on how well your strategy is performing financially.

It guarantees that the information about the highest profit reached is delivered to your code in the order it occurs, even if your code takes some time to process each notification. 

It also handles things safely to avoid conflicts if your code needs to react to the profit update. This makes it perfect for tracking important profit milestones and adjusting your trading strategy on the fly.

You provide a function, and this function will call yours whenever a new highest profit is detected.


## Function listenExit

This function allows you to monitor for and react to serious, unrecoverable errors that can halt your trading processes. Think of it as a safety net for situations that would otherwise crash your application. 

It specifically watches for errors within background tasks like Live, Backtest, and Walker processes.

These aren’t the usual errors you might handle and continue from; these are critical problems that stop everything.

The function delivers errors in the order they occur, and it makes sure that your response to the error happens one step at a time to prevent conflicts. You provide a function that will be called when one of these fatal errors occurs, and it returns a function to unsubscribe from listening to those errors.

## Function listenError

This function lets you react to errors that happen while your trading strategy is running, but aren't critical enough to stop everything. Think of it as a safety net for hiccups in your API calls or other processes.

It ensures errors are handled one at a time, in the order they happen, so you can avoid any unexpected behavior. Essentially, it gives you a way to address issues as they arise without interrupting the overall trading flow. You provide a function that will be called when such an error occurs.


## Function listenDoneWalkerOnce

This function lets you react to when a background process within your trading strategy finishes, but only once. You provide a filter to specify which completions you're interested in, and a function to execute when the event you're looking for occurs.  It’s designed for situations where you need to perform a single action based on a background task’s completion, like updating a display or triggering a subsequent process – once it's done, the subscription automatically ends. It simplifies managing those one-off reactions.


## Function listenDoneWalker

This function lets you listen for when a background task within the trading framework finishes running. It's useful if you need to react to the completion of a process, like data processing or calculations. 

When a background task is done, it will notify your provided function. Importantly, these notifications happen one after another, even if your function takes some time to execute – this helps avoid issues with multiple things happening at once. Think of it as a reliable way to know when something's finished and ready for the next step. 

You give it a function (the `fn` parameter) that will be called when the background process is complete, and it returns another function that you can use to unsubscribe from these notifications later.


## Function listenDoneLiveOnce

This function lets you react to when a background task, started with `Live.background()`, finishes. It's designed to be simple – you provide a condition to check which completions you care about, and a function to run once when that condition is met. Once that function runs, it automatically stops listening for further completion events, making it a convenient way to handle a single, specific event without needing to manage subscriptions yourself. Think of it as setting up a temporary listener that cleans itself up after it’s done its job.


## Function listenDoneLive

This function allows you to monitor when background tasks initiated through the `Live.background()` method finish running. It’s useful for knowing when a process has completed and any associated cleanup or next steps need to be taken.  The events are delivered one at a time, in the order they occur, even if the provided callback function takes time to execute. To ensure things run smoothly, the callback is handled in a way that prevents multiple calls from happening at the same time. You provide a function that will be called with details about the completed task whenever a background task finishes. The function you provide returns another function, which you can use to unsubscribe from these events later.


## Function listenDoneBacktestOnce

This function lets you react to when a background backtest finishes, but only once. You provide a way to specify which backtest completions you're interested in – like filtering based on certain conditions – and a function to run when that specific completion event occurs. Once the callback runs, the subscription is automatically removed, so you don't have to worry about cleaning up. It’s perfect for things like logging a final result or triggering a single action after a background task.

Here's a breakdown:

*   **`filterFn`**: This is like a rule. It decides if the backtest completion event is the one you want to respond to.
*   **`fn`**: This is what actually *happens* when the `filterFn` matches a completion event. It will only run a single time.

The function returns a cleanup function that you can call to unsubscribe manually if needed, though it's generally not necessary because the subscription is automatic.

## Function listenDoneBacktest

This function lets you be notified when a background backtest finishes running. 

It's like setting up a listener that gets triggered once the backtest is done.

The listener will handle events sequentially, ensuring that even if the notification involves some processing, it happens in order. 

You provide a function that will be called when the backtest completes, and this function will be wrapped to handle execution safely. 

The function you provide returns a function that you can use to unsubscribe from these completion events whenever you need to.

## Function listenBreakevenAvailableOnce

This function lets you set up a listener that reacts to changes in breakeven protection, but only once. It’s handy when you need to respond to a specific breakeven situation and then want to stop listening. You provide a filter to determine which events trigger the response, and a function to execute when that event occurs.  Once the event is processed, the listener automatically stops listening, preventing unnecessary updates.

## Function listenBreakevenAvailable

This function allows you to be notified whenever a trade's stop-loss order is automatically adjusted to the entry price – essentially, protecting your profit. It's triggered when the price moves favorably enough to cover the costs of the trade. Because these events can happen frequently and callbacks might take some time to process, the system queues them to ensure they are handled one at a time, preventing any conflicts. You provide a function that will be executed each time this breakeven event occurs, and this function will receive details about the trade involved.  The function you provide will return an unsubscribe function which you can use to stop receiving those notifications.


## Function listenBacktestProgress

You can now listen for updates as a backtest runs. This function lets you subscribe to events that report on the backtest's progress, such as how far along it is. 

These events are delivered one after another, even if the code inside your listener function takes some time to complete. To ensure that these updates are handled safely, they are processed in a queued manner.

To stop listening for these updates, the function returns a cleanup function that you should call when you no longer need the progress information.

## Function listenActivePingOnce

This function helps you react to specific active ping events just once and then stop listening. 

You provide a way to identify the events you're interested in—a filter—and a function to execute when a matching event occurs. 

Once that one event is processed, the function automatically stops listening, preventing further callbacks. It's a convenient way to monitor for a particular condition and then move on.


## Function listenActivePing

This function allows you to keep track of active trading signals. It listens for updates – happening roughly every minute – that tell you about the current status of these signals. Think of it as a way to monitor what's happening with your trading strategies in real-time.

The updates are handled in the order they arrive, and the function ensures that any actions your callback performs don't overlap, preventing unexpected behavior. You provide a function that will be called with each signal update, giving you the information you need to react and adjust your trading logic. This is particularly helpful for managing strategies that need to respond to changes in the market.

## Function listWalkerSchema

This function gives you a peek behind the scenes, revealing all the trading strategies (walkers) that have been set up within the backtest-kit framework. Think of it as a roster of all the potential trading approaches you're working with. It gathers information about each one, presenting them in a structured way. This is especially handy if you're troubleshooting, creating documentation, or wanting to build interfaces that adapt to the available strategies.

## Function listStrategySchema

This function lets you see a complete list of all the trading strategies that have been set up within your backtest-kit environment. Think of it as a way to inventory what strategies are available for testing or documentation.  It pulls information about each strategy, allowing you to understand their configurations and properties.  You can use this to build tools that automatically display strategy options or to troubleshoot any registration issues. It essentially gives you a snapshot of the strategies your system recognizes.

## Function listSizingSchema

This function lets you see all the sizing strategies currently set up within your backtest-kit environment. It returns a list of configurations, each describing how position sizes are determined. Think of it as a way to inspect the rules governing how much of an asset your simulated trades will use. It’s helpful if you're troubleshooting, documenting your strategies, or building a user interface to visualize these sizing settings.

## Function listRiskSchema

This function allows you to see all the risk configurations currently set up within your backtest kit environment. It provides a way to get a list of all the registered risk schemas, which are essentially pre-defined rules or models for assessing risk. Think of it as a tool to check what risk factors your backtest is considering, useful for troubleshooting or creating tools that need to understand the system's risk assessment setup. The function returns a promise that resolves to an array containing these risk schemas.


## Function listMemory

This function lets you see all the saved memory entries associated with your current signal. It's like peeking into the system's memory to understand what's been stored.

It cleverly figures out which signal you're working with and whether you're in a backtest or live trading environment without you needing to specify it.

You just need to provide a bucket name to identify where the memory entries are stored. The function returns a list of memory IDs and their content.

## Function listFrameSchema

This function lets you see a list of all the different data structures, or "frames," that your backtesting system understands. Think of it as a directory of all the types of information you're working with – like price data, volume, or custom indicators. It’s handy for understanding how your system is set up, creating documentation, or building tools that adapt to different setups. The function returns a list of these "frame schemas" which you can then use in your code.


## Function listExchangeSchema

This function helps you discover all the different exchanges your backtest-kit system knows about. It returns a list describing each exchange, which is useful if you need to examine or display them, perhaps for troubleshooting or creating user interfaces. Think of it as a way to see what data sources your backtest-kit is able to connect to. It gathers information about exchanges that have been previously added using the `addExchange()` function.

## Function hasTradeContext

This function simply tells you whether the trading environment is ready for actions. 

It confirms that both the execution context and the method context are active. 

Think of it as a gatekeeper – it ensures that you can safely use functions like `getCandles` or `formatPrice` that rely on a properly initialized trading environment. If this function returns `false`, it means you need to set up the environment further before proceeding.

## Function hasNoScheduledSignal

This function checks if a trading signal is currently scheduled for a specific symbol, like BTC-USDT. It returns `true` if no scheduled signal exists, and `false` if one is already planned. Think of it as the opposite of a function that *does* check for scheduled signals. It’s designed to help you control when new signals are created, preventing potential conflicts or unexpected behavior depending on whether you're running a backtest or live trading. The function knows whether it’s running in a backtest or live environment automatically. You just provide the symbol you're interested in.

## Function hasNoPendingSignal

This function checks if there’s currently no signal waiting to be triggered for a specific trading pair. It essentially tells you if the system is in a state where it's safe to consider generating a new signal. Think of it as the opposite of `hasPendingSignal`; if this returns `true`, it means no signal is currently blocking further actions. The function intelligently adapts to whether you're running a backtest or a live trading session. You provide the trading pair's symbol (like "BTCUSDT") to this function, and it will return a `true` or `false` value indicating whether a pending signal exists.

## Function getWalkerSchema

This function helps you understand the structure of a trading strategy or indicator you're using. It fetches the defined blueprint, or schema, for a specific walker—think of a walker as a modular component within your trading system. By providing the walker's name, you'll get a detailed look at what properties and data it expects, making it easier to integrate and debug. Essentially, it’s a way to peek under the hood and see how a particular part of your backtesting environment is organized.


## Function getTotalPercentClosed

This function helps you understand how much of a trading position you still have open. It tells you the percentage remaining, with 100 meaning the entire position is still active and 0 meaning it’s completely closed. 

It takes the trading pair symbol as input, such as "BTCUSDT".

The function handles situations where you’ve added to your position over time (Dollar-Cost Averaging or DCA), accurately reflecting the percentage closed even with multiple partial closures.

It figures out whether the system is in backtesting or live trading mode on its own.

## Function getTotalCostClosed

This function helps you figure out how much money you've spent on a particular trading pair, like BTC/USD. It looks at all your past buy orders, even if you've sold some of your holdings along the way.  It's designed to handle situations where you bought in smaller amounts over time (Dollar Cost Averaging) and then sold off portions of that initial investment. The function automatically knows whether it's running in a backtest or a live trading environment. 

You just need to provide the symbol of the trading pair you're interested in, and it will return the total cost basis in dollars.

## Function getTimestamp

This function provides a way to retrieve the current timestamp, and how it behaves changes depending on whether you're running a simulation (backtest) or live trading. When testing strategies against historical data, it returns the timestamp associated with the specific point in time being analyzed. If you're actively trading, it gives you the current, real-time timestamp. Essentially, it's a reliable way to know what time it is within the context of your trading activity.


## Function getSymbol

This function provides a simple way to find out which asset you’re currently trading within your backtest or simulation. It returns a promise that resolves to a string representing the symbol, like "AAPL" or "BTCUSDT".  Think of it as asking the system, "What am I trading right now?". You’ll use this to ensure your trading logic applies to the correct asset.


## Function getStrategySchema

The `getStrategySchema` function helps you find details about a specific trading strategy you've set up. Think of it as looking up the blueprint for a strategy – it tells you what inputs the strategy needs and what kind of calculations it performs. You provide the strategy's unique name, and the function returns a structured description of that strategy's workings. This makes it easy to understand and work with different strategies within your backtesting environment.

## Function getSizingSchema

This function lets you fetch the specific rules and logic used to determine the size of your trades. Think of it as looking up a blueprint for how much capital to allocate to each trade based on its name. You provide the name of the sizing method you want to use, and it returns the detailed configuration for that method. This configuration tells the backtest kit exactly how to calculate trade sizes.

## Function getSignalState

This function helps you retrieve a specific value associated with an active trading signal. It's designed to work seamlessly within the backtest-kit framework, automatically identifying whether you're in a backtesting or live trading environment.

It looks for the active signal based on the current execution context. If a signal isn't found, it will give you a friendly warning and use your provided initial value instead.

This is particularly useful for advanced strategies—like those using LLMs—that need to track metrics on a trade-by-trade basis, like how long a trade is open or its peak profit. Think of it as a way to keep track of details over time for each individual signal.

You provide the symbol you’re trading and a small object containing your initial value, which is used if no signal is present.

## Function getSessionData

This function lets you access data that's saved specifically for a particular trading setup – the symbol, strategy, exchange, and timeframe you're using. Think of it as a temporary storage space that remembers things between candles while you're testing or live trading. 

It's perfect for holding information that you need to keep track of across multiple candles, like the results of calculations or intermediate states, even if the program restarts.  The function automatically adjusts its behavior depending on whether you’re in backtest or live mode.

You provide the symbol (like "BTCUSDT") to identify the data you want to retrieve. If no data is found for that symbol, it will return null.


## Function getScheduledSignal

This function lets you retrieve the currently planned or active trading signal for a specific asset, like BTC-PERP. 

It’s designed to work whether you’re testing a strategy in a simulated environment or running it live.

If there isn't a scheduled signal set up for that asset, the function will simply return nothing. 

You just need to specify which trading pair's signal you want to check.


## Function getRiskSchema

The `getRiskSchema` function lets you fetch details about a specific risk management strategy you've defined within the backtest-kit framework. Think of it as looking up the blueprint for how a particular risk is handled. You provide the unique name you gave that risk when you set it up, and the function returns a structured object containing all the information about that risk schema. This allows you to examine or programmatically interact with the risk management logic.


## Function getRawCandles

The `getRawCandles` function allows you to retrieve historical candlestick data for a specific trading pair and time interval. You can control how many candles are fetched and define a date range to narrow down the data.

You have a lot of flexibility in specifying the date range and the number of candles. For example, you can provide a start and end date, just an end date with a limit, or only a limit to fetch candles starting from a default point in the past.

Importantly, the function is designed to avoid look-ahead bias, meaning it only uses data that would have been available at a given time.

Here's a breakdown of the parameters:

*   `symbol`: The trading pair, like "BTCUSDT".
*   `interval`: The time interval for the candles, such as "1m" (one minute) or "1h" (one hour).
*   `limit`: The number of candles you want to retrieve.
*   `sDate`: The start date for the data (in milliseconds).
*   `eDate`: The end date for the data (in milliseconds).

## Function getPositionWaitingMinutes

This function helps you check how long a signal has been waiting to be put into action. It tells you the waiting time in minutes for a specific trading pair, like "BTCUSDT". 

If there isn’t a signal currently waiting, it will return null. You provide the symbol of the trading pair you're interested in to find out its waiting status. This can be useful for monitoring the timing of your automated trading strategies.

## Function getPositionPnlPercent

This function helps you understand the potential profitability of a trade you’re holding. It calculates the unrealized profit or loss as a percentage, taking into account things like any partial closing of your position, dollar-cost averaging, potential slippage, and fees. 

If you don't have any pending signals or positions open, it will return null.

It handles the complexities of whether you're in a backtest or a live trading environment and automatically retrieves the current market price to make the calculation. You simply provide the symbol (like BTC/USDT) to get the percentage.


## Function getPositionPnlCost

This function lets you check the unrealized profit or loss in dollars for a trading position you currently hold. It considers factors like partial closes, averaging in, any slippage, and trading fees to give you a complete picture of your potential gain or loss. 

If you don’t have any open positions, it will return null.

The function works whether you're running a backtest or a live trade and automatically gets the latest price for the asset. To use it, you just need to provide the trading symbol (like BTC/USDT).


## Function getPositionPartials

This function lets you check the history of partial profit or loss closures for a specific trading pair. It returns a list of events, detailing how much of the position was closed, the price at which it was closed, and the cost basis at the time. If there's no active trade happening, the function won't return anything. If some partial closures have happened, it will give you a list of those events, complete with details like the execution price and accumulated cost basis. You simply provide the trading pair symbol to get the relevant information.

## Function getPositionPartialOverlap

This function helps ensure you aren't accidentally triggering multiple partial closing orders near the same price level. It checks if the current market price falls within a defined tolerance range around any previously executed partial closing prices for a specific trading pair. 

Essentially, it prevents redundant orders by verifying if the current price is already covered by a recent partial close. 

You provide the trading symbol, the current price, and optionally a configuration for the tolerance range (how far above and below the existing partial close price is acceptable). The function returns true if the current price falls within that tolerance zone for any existing partials; otherwise, it returns false, indicating no potential conflict. This is particularly useful when automating trading strategies to avoid unwanted order execution.


## Function getPositionMaxDrawdownTimestamp

This function helps you find out when a specific trading position experienced its greatest loss. It tells you the exact timestamp of that moment, allowing you to analyze the position's performance history. 

If there's no active trading signal for that position, the function will return null, indicating that the data isn't available. You only need to provide the symbol of the trading pair (like 'BTC-USD') to get this information.


## Function getPositionMaxDrawdownPrice

This function helps you understand the risk associated with a specific trading position. It calculates the maximum drawdown – essentially, the largest peak-to-trough decline – that the position experienced while it was open. 

Think of it as figuring out how much the position's value dropped at its worst point.

You provide the symbol of the trading pair (like BTC/USD) as input, and the function returns a number representing that maximum drawdown price. If there’s no active signal for that position, it won’t be able to calculate anything and will return null.

## Function getPositionMaxDrawdownPnlPercentage

This function helps you understand the potential risk associated with a specific trading position. It calculates and returns the percentage of profit or loss experienced at the point when the position reached its lowest value. Essentially, it tells you how far underwater the position went at its worst. 

If there’s no active trading signal, the function will return null, indicating that the calculation can't be performed.

You provide the trading pair symbol (like "BTCUSDT") to specify which position you're interested in.


## Function getPositionMaxDrawdownPnlCost

This function helps you understand the financial impact of a trading position's biggest losses. It calculates the profit and loss (PnL) cost – essentially, how much money you lost – at the exact point when the position hit its lowest value. 

Think of it as quantifying the "pain point" of your worst drawdown.

You provide the trading symbol, like "BTC-USDT," and it returns a numerical value representing that cost. If there's no active trading signal related to that position, it won't be able to provide a result and will return null.


## Function getPositionMaxDrawdownMinutes

This function helps you understand how far back in time your trading position experienced its biggest loss. It tells you the number of minutes that have passed since the lowest point of your position’s value. Think of it as a way to gauge how much time has passed since your position hit rock bottom.

The value will be zero if the lowest point occurred right now.

If there isn't a current trading signal for the specified asset, the function returns null, indicating that no drawdown information is available.

You need to provide the symbol of the trading pair you're interested in, such as "BTCUSDT."


## Function getPositionLevels

This function helps you understand the prices at which your DCA (Dollar-Cost Averaging) strategy has entered a position. It gives you a list of prices, starting with the original entry price and including any additional prices used when you committed to buying more through `commitAverageBuy()`.

If there's no active trading signal, it will return nothing.

If you only made one entry at the original price, it will return a list containing just that initial price. The function requires the trading pair symbol, like "BTCUSDT," to identify the position you’re asking about.

## Function getPositionInvestedCount

getPositionInvestedCount tells you how many times a DCA (Dollar Cost Average) has been used for a particular trading pair. It's a simple count – 1 means the initial buy order, and each subsequent increase reflects a successful commitAverageBuy() operation. If there's no active signal for that trading pair, the function will return null. It works seamlessly whether you're running a backtest or a live trade, automatically adapting to the current mode. You just need to provide the trading pair’s symbol, like 'BTCUSDT', to get the count.


## Function getPositionInvestedCost

This function lets you find out how much money you've invested in a particular trading pair, specifically for the signal that's currently being prepared. It adds up all the costs associated with buying into that position. 

Think of it as calculating the total cost of all your initial purchases.

If there isn't a signal being prepared, the function will return null.

It figures out whether it's running a backtest or a live trading session automatically.

You simply need to provide the symbol of the trading pair you’re interested in.

## Function getPositionHighestProfitTimestamp

This function helps you find out when a specific trading position reached its highest profit point. It essentially looks back at the history of a trade and tells you the exact timestamp when the profit was at its peak. 

If there’s no record of a trading signal for that particular symbol, the function will return null, indicating that no peak profit time can be determined. You'll need to provide the trading symbol, like "BTCUSDT," to get the timestamp.


## Function getPositionHighestProfitPrice

This function helps you understand the peak profit potential of an open trade. It keeps track of the highest price reached above your entry price for long positions, and the lowest price below your entry price for short positions. Think of it as a record of how far your trade has moved in a profitable direction since it started.

The function begins by noting the entry price when the position is opened. It's updated with each new price movement (tick or candle) as long as the trade is active, always providing a value, even if it's just the initial entry price. The symbol of the trading pair you’re analyzing is required to correctly identify the position.


## Function getPositionHighestProfitMinutes

This function helps you understand how long a trading position has been operating below its best performance. Specifically, it calculates the time, in minutes, since the position reached its highest profit point. Think of it as a measure of how far the position has fallen from its peak. 

The returned value will be zero if the position is currently at its highest profit. If there are no signals associated with the position, the function returns null. You need to provide the trading pair symbol as input to determine which position's performance you’re investigating.

## Function getPositionHighestProfitDistancePnlPercentage

This function helps you understand how far your trading position is from its best performance. It calculates the difference between the highest profit percentage achieved so far and the current profit percentage. 

Essentially, it tells you how much room there is for improvement, or how much you've recovered from a potential loss.

The function requires the trading pair symbol as input, like "BTCUSDT".

It will return a number representing that percentage difference, but will return nothing if there's no trading data available.

## Function getPositionHighestProfitDistancePnlCost

This function helps you understand how far your current position is from its best possible profit. It calculates the difference between the highest profit you could have achieved (peak profit) and what you've made so far (current profit), but it only considers the positive difference – meaning it won't show a negative number. 

Think of it as a measure of how much room you have to improve your position’s profitability.

The function needs to know which trading pair (like BTC/USDT) you're interested in to perform this calculation. If there’s no pending trading signal, the function will return null.


## Function getPositionHighestProfitBreakeven

This function checks if a trade could have reached a breakeven point based on its highest profit achieved. It essentially determines if the trade's peak performance allowed for a return to the initial entry price. 

If there are no active trade signals for a particular trading pair, the function will indicate that it can’t evaluate a breakeven point. 

You provide the trading symbol (like "BTCUSDT") to the function, and it will tell you whether breakeven was mathematically possible given the trade's performance.

## Function getPositionHighestPnlPercentage

This function helps you understand the peak profitability of a specific trading position. It tells you the highest percentage gain the position achieved at any point during its lifespan.

Essentially, it’s looking back at a position's history to find its most profitable moment.

To use it, you just provide the symbol of the trading pair you’re interested in, like 'BTCUSDT'.

If there's no data available for a signal, the function will return null.


## Function getPositionHighestPnlCost

This function helps you understand how much it originally cost to achieve the most profitable price for a specific trading pair. It retrieves the PnL cost, expressed in the quote currency, at the point when that highest profit was realized for the position. If there's no existing signal data, it will return null. To use it, you simply provide the symbol of the trading pair you're interested in, such as 'BTC-USDT'.

## Function getPositionHighestMaxDrawdownPnlPercentage

This function helps you understand how much your trading position has recovered from its most significant losses. It calculates the difference between your current profit percentage and the lowest profit percentage it reached during a drawdown period. The result represents the percentage gain needed to return to the peak before the drawdown. If no trading signal is available for the given symbol, the function will return null. You provide the trading pair symbol to get this information for a specific asset.

## Function getPositionHighestMaxDrawdownPnlCost

This function helps you understand how much your trading position has lost relative to its lowest point. It calculates the difference between the current profit and loss (PnL) and the lowest PnL it reached during a drawdown. 

Essentially, it tells you how far your position is from its worst performance.

The function requires the symbol of the trading pair you're interested in. If there's no existing trade signal, the function won’t return a value.

## Function getPositionEstimateMinutes

This function helps you understand how long a trading position is expected to last. It gives you the initial estimate for how many minutes a signal will remain active before it expires. 

Essentially, it tells you the timeframe the system originally anticipated for the trade.

If there isn't a signal currently active, the function will return null. You need to provide the symbol of the trading pair you're interested in.

## Function getPositionEntryOverlap

This function helps you avoid accidentally placing multiple DCA entries too close together. It checks if the current price is near any of your existing DCA entry levels, taking into account a small tolerance range.

Essentially, it’s a safeguard to prevent prices from triggering multiple entries within a tight range, ensuring a more controlled trading strategy.

The function will tell you if the current price falls within that tolerance zone around any existing entry level. If there are no existing entries, it returns false.

You can also customize how much wiggle room is allowed around the levels by providing a configuration object.

## Function getPositionEntries

This function helps you see how a trade has been built up over time. It lets you look at the individual prices and costs associated with each step of a trade, whether it's the initial purchase or a subsequent dollar-cost averaging (DCA) addition. 

You provide the symbol of the trading pair, like "BTCUSDT," and it returns a list of these entries.

If there's no trade currently being built, you'll get nothing back. If the trade was made with just one step (no DCA), you’ll get a list containing just one entry. Each entry tells you the price at which it was bought and the amount of money used for that part of the trade.


## Function getPositionEffectivePrice

This function helps you understand the average price at which you've acquired a position in a trading pair. It calculates a weighted average, taking into account any previous partial closes and DCA (Dollar-Cost Averaging) entries. 

Essentially, it's like figuring out your effective entry price considering all the changes you've made to your position.

If there's no active trading signal, it will return null. 

It works whether you're running a backtest or trading live.

You just need to provide the symbol of the trading pair, such as "BTCUSDT".

## Function getPositionDrawdownMinutes

`getPositionDrawdownMinutes` helps you track how far a trading position has fallen from its best performance. It tells you how many minutes have passed since the price reached its highest point for that trade. This value starts at zero when the price peaks and increases as the price drops further. If there isn't an active trade happening, the function will let you know by returning nothing. You just provide the trading pair's symbol to get this drawdown information.

## Function getPositionCountdownMinutes

This function helps you figure out how much time is left before a trading position expires. It calculates this by looking at when the position was initially marked as pending and comparing it to an estimated expiration time.

If the estimated time has already passed, the function will tell you there are zero minutes remaining. It will never report a negative time.

If a position hasn't been marked as pending yet, the function will return null, indicating there's no countdown to calculate. 

You provide the symbol of the trading pair (like "BTC-USDT") to find the countdown for that specific position.


## Function getPositionActiveMinutes

getPositionActiveMinutes tells you how long, in minutes, a particular trading position has been open. 

It figures this out by looking at the trading history for that symbol.

If there isn't a record of a pending signal for the position, it will return null.

To use it, you just need to provide the symbol of the trading pair you’re interested in.


## Function getPendingSignal

This function helps you find out what signal is currently waiting to be executed for a specific trading pair. Think of it as checking if a trade order is already in progress. 

It looks for an active, pending signal – basically, a signal that's been generated but hasn't been fully processed yet.

If there isn’t a pending signal for the symbol you ask about, it will tell you by returning null.

It works seamlessly whether you're backtesting historical data or running live trades, because it figures out the environment automatically. 

You just need to provide the symbol, like "BTCUSDT," and it will do the rest.


## Function getOrderBook

This function lets you retrieve the order book for a specific trading pair, like BTCUSDT. 

It pulls data directly from the exchange you're connected to.

You can specify how many levels of the order book you want – the default is a fairly deep view, but you can request less if you need.

The function takes into account the current time when fetching data, which is important for both backtesting and live trading scenarios.


## Function getNextCandles

This function helps you retrieve future candles for a specific trading pair and time interval. It essentially asks the exchange to give you a set of candles that come *after* the current time the system is aware of.

You provide the symbol of the trading pair (like BTCUSDT), the desired candle interval (like 1m, 5m, 1h), and how many candles you need. The function returns a promise that resolves with an array of candle data. This is useful for anticipating potential market movements or building more complex trading strategies.


## Function getMode

This function tells you whether the system is currently running a backtest (analyzing historical data) or operating in a live, real-time trading environment. It returns a promise that resolves to either "backtest" or "live", giving you a simple way to adjust your code's behavior based on the environment it's running in. You can use this to conditionally enable or disable certain features, logging, or actions, for example.

## Function getMinutesSinceLatestSignalCreated

This function helps you figure out how much time has passed since the last trading signal was generated for a specific asset. It essentially tells you the number of minutes that have gone by.

It doesn’t care whether that signal is still active or already closed—it just looks at the timestamp of the most recent signal. 

This can be really handy for things like setting up cooldown periods after a stop-loss order is triggered.

If there are no signals at all for that asset, it returns null to indicate that.

The function automatically knows whether it’s running in backtesting mode or live trading mode.

You just need to provide the symbol of the trading pair you’re interested in.

## Function getMaxDrawdownDistancePnlPercentage

This function helps you understand the risk profile of a trading strategy by calculating the maximum drawdown in percentage terms. It essentially measures the largest drop from the highest point of profit to the lowest point of loss experienced by a position.

The result represents the peak-to-trough difference in percentage terms, ensuring a non-negative value. If the strategy hasn’t generated any signals yet, the function will return null. You provide the trading symbol, like "BTC-USDT," to specify which strategy you want to analyze.

## Function getMaxDrawdownDistancePnlCost

This function helps you understand the risk profile of your trading strategy. It calculates the difference between the highest profit you've ever made and the biggest loss you've experienced, focusing on the profit and loss (PnL) cost. Essentially, it tells you how far your position’s value has swung from its peak to its lowest point. 

The result represents a numerical measure of this drawdown distance, always ensuring the value is zero or greater.  If there's no trading activity or signals, the function won’t be able to compute a drawdown, and it will return a null value. To use the function, you provide the trading pair's symbol, like "BTC-USDT".


## Function getLatestSignal

This function helps you retrieve the most recent trading signal for a specific symbol, whether it's still active or has already been closed. It's really handy for things like implementing cooldown periods – for example, you might want to prevent a new trade for a few hours after a stop-loss event, regardless of whether the previous trade was profitable or not.

It looks for signals first in your historical backtest data and then checks the live data if nothing is found. If no signals exist, it returns null.

You don’t need to worry about whether you're in backtest mode or live trading; the function handles that automatically. 

The only thing you need to provide is the symbol of the trading pair you're interested in.

## Function getFrameSchema

This function lets you find the blueprint for a specific type of data structure used in your backtesting environment. Think of it as looking up the expected format for a particular piece of information, like a candlestick bar or an order event. You provide the name of the frame you're interested in, and it returns a detailed description of what that frame contains. This is helpful when you want to ensure the data you're working with conforms to the expected standards for your backtesting process.


## Function getExchangeSchema

This function lets you grab the details of a specific exchange that's been set up within the backtest-kit system. Think of it as looking up a blueprint for how a particular exchange works – things like what markets it offers, how orders are placed, and what data it provides. You give it the name of the exchange you're interested in, and it returns a structured description outlining its features. This is useful for understanding the configuration of an exchange or for dynamically adapting your trading strategies.


## Function getDefaultConfig

This function gives you a set of default settings for the backtest-kit framework. Think of it as a starting point for your configurations – it provides sensible values for things like retry counts when fetching data, limits on the number of signals and notifications, and controls for various features like DCA and trailing stops. You can look through these default values to understand all the different configuration options that are available, and then customize them to fit your specific trading strategies and needs. It’s a helpful way to explore the framework’s capabilities and understand what’s possible.

## Function getDefaultColumns

This function gives you the standard set of columns used to build your backtest reports. Think of it as a template showing you all the possible data fields you can display – things like profit/loss, risk metrics, strategy events, and more. It provides a ready-made structure, complete with predefined settings for each column, so you can understand what’s possible and customize your reports accordingly. You can peek at this default configuration to see exactly how each column is structured and what kind of information it holds.

## Function getDate

This function, `getDate`, allows you to retrieve the date relevant to the current point in time within your trading simulation or live trading environment. When running a backtest, it provides the date associated with the historical timeframe being analyzed. Conversely, when actively trading, it returns the current, real-time date. This helps you synchronize your trading logic with the correct date for calculations, data retrieval, or any date-dependent actions.


## Function getContext

This function allows you to access information about the current trading method's environment. Think of it as a way to peek behind the scenes and see details like the specific timeframe or the method's state. It returns a special object with all these details, which you can then use to make informed decisions within your trading logic. Essentially, it gives you a window into how and where your method is running.

## Function getConfig

This function lets you peek at the framework's settings. It's like getting a snapshot of how the backtest kit is currently set up. 

The configuration includes a wide range of values, controlling things like how often data is updated, limits on how much slippage is tolerated, and the maximum number of signals that can be generated. These settings influence the behavior and performance of your backtests.

Importantly, the function returns a copy of the configuration, so you can examine the values without changing the actual settings used by the system. It provides read-only access to the global configuration.

## Function getColumns

This function lets you see how your backtest results will be displayed in a report. It provides a snapshot of all the columns being used, including those for trade details, heatmap data, live events, partial fills, breakeven points, performance metrics, risk assessments, scheduling, strategy activity, synchronization, highest profit, maximum drawdown, walker profit/loss, and overall strategy results.  Think of it as a way to examine the structure of your report without changing anything.  It gives you a read-only view of how your data is organized for reporting purposes.

## Function getClosePrice

This function helps you retrieve the closing price from the most recent candle available for a specific trading pair. You provide the symbol, like "BTCUSDT" for Bitcoin against USDT, and the timeframe of the candle, such as "1h" for a one-hour candle. It returns a promise that resolves to the closing price as a number. 

It's a quick way to get the latest closing price data for your analysis or trading strategies.


## Function getCandles

This function retrieves historical price data, specifically candles, for a given trading pair and timeframe. Think of it as pulling up a chart of past prices for a specific asset. You provide the symbol, like "BTCUSDT" for Bitcoin against USDT, the interval like "1h" for one-hour candles, and how many candles you want to see. The function then fetches this data from the exchange you’re connected to, giving you a glimpse into past price movements.

It gets the candles from the exchange's own candle fetching method and pulls them back from the present time. 

Here’s what you’ll need to specify:

*   **symbol:** The trading pair you're interested in (e.g., BTCUSDT).
*   **interval:** The timeframe for each candle (options include 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, and 8h).
*   **limit:**  How many candles you want to retrieve.


## Function getBreakeven

This function helps determine if a trade has reached a point where it’s made enough profit to cover the initial costs involved. It looks at the current price of an asset and compares it to a calculated threshold that accounts for potential slippage and trading fees. If the price has moved sufficiently in a profitable direction to surpass this threshold, the function returns true, indicating breakeven has been achieved. It automatically adapts to whether you're running a backtest or a live trading session. You provide the symbol of the trading pair and the current price to check.

## Function getBacktestTimeframe

This function helps you find out the dates used for a specific trading pair when running a backtest. 

It takes the symbol of the trading pair – like "BTCUSDT" – and returns a list of dates. 

Think of it as discovering the historical timeframe your backtest is covering for that particular asset. This lets you understand exactly what period of data is being analyzed.


## Function getAveragePrice

This function helps you determine the VWAP (Volume Weighted Average Price) for a specific trading symbol, like BTCUSDT. It looks at the most recent five one-minute candles to figure this out. 

The calculation involves figuring out a "typical price" for each candle (average of high, low, and close), then weighing that price by the volume traded at that time.

If there's no trading volume available, it falls back to a simpler calculation, just averaging the closing prices instead.

You just need to provide the symbol of the trading pair you're interested in.

## Function getAggregatedTrades

This function helps you retrieve historical trades for a specific trading pair, like BTCUSDT. It pulls this data directly from the exchange you're using.

You can request a limited number of trades, or if you don't specify a limit, it will fetch trades within a defined time window. The trades are returned in chronological order, starting from the most recent and going backwards. This is useful for analyzing past price action and building strategies.


## Function getActionSchema

This function lets you fetch the definition of a specific action within your backtest kit. Think of it as looking up the blueprint for how a particular trade signal or event should be handled. You provide the action's name, and it returns the schema describing its inputs, outputs, and behavior. It's essential for understanding and validating the structure of actions used in your trading strategies.

## Function formatQuantity

This function helps you display the correct quantity of a trading pair, taking into account the specific rules of the exchange you're using. It takes the symbol of the trading pair, like "BTCUSDT," and the raw quantity value as input. The function then automatically handles things like the correct number of decimal places required by the exchange, ensuring your displayed quantities are accurate and compliant. It returns the formatted quantity as a string.


## Function formatPrice

This function helps you display prices in a way that aligns with specific exchanges. It takes a symbol like "BTCUSDT" and a numerical price as input. The function then automatically adjusts the number of decimal places to match the formatting rules used by that particular exchange, ensuring accurate and consistent price displays. You don't have to worry about the details of formatting; it handles that for you.


## Function dumpText

The `dumpText` function lets you record raw text data, associating it with a specific signal and a unique identifier. Think of it as a way to capture notes or observations related to a particular trading event.  It takes a simple object containing the bucket name, the dump ID, the actual text content, and a short description.

Importantly, this function handles the signal detection for you - it figures out what signal is currently active, whether you're running a backtest or in a live trading environment. It automatically resolves the active pending or scheduled signal from the execution context so you don't have to manage that yourself. This simplifies the process of storing associated text data alongside your trading signals.


## Function dumpTable

This function helps you display data as a nicely formatted table within your backtest or live trading environment. It takes an array of objects, where each object represents a row in the table. The function automatically figures out the table's context, so you don’t have to specify it. 

It also intelligently determines whether you're running a backtest or a live trading session. The column names for your table will be based on all the different keys found in the data you provide. It simplifies displaying results in a clear and organized way.


## Function dumpRecord

This function helps you save a record of data, like a snapshot of the market conditions and your actions at a specific moment. Think of it as creating a labelled log entry.

It takes a small set of information – the name of the data container, a unique identifier for the dump, the actual data record itself (a collection of key-value pairs), and a descriptive note to explain what the record represents.

The function is smart; it figures out whether you're running a backtest (simulated historical analysis) or a live trading scenario. It also automatically identifies the current trading signal relevant to the record.  Ultimately, it saves this information for later review and analysis.


## Function dumpJson

The `dumpJson` function lets you save complex data structures, like configuration settings or analysis results, as formatted JSON within your backtest or live trading environment. It essentially takes a JavaScript object and converts it into a readable JSON block, associating it with a unique identifier and a descriptive label. This is particularly useful for debugging or auditing your trading strategies, as it allows you to record specific states of your system at particular points in time. The function automatically handles the complexities of signal management and adapts to whether you’re in a backtesting or live trading scenario.

The data you provide will be saved with a given bucket name and a dump ID, making it easy to identify and retrieve later. You also provide a description to help you remember what the JSON block represents.

## Function dumpError

The `dumpError` function helps you record error details, associating them with a specific signal. Think of it as a way to document issues that arise during trading. It automatically figures out whether you're in a backtesting or live trading environment. You provide the function with information like the bucket name, a unique dump ID, the actual error message, and a brief description of the problem. It handles the signal context for you, making it easier to track errors in relation to your trading signals.

## Function dumpAgentAnswer

This function helps you save complete conversations with an agent, including all the messages exchanged. It's useful for reviewing how the agent performed or for debugging purposes. 

The function automatically handles the complexities of knowing which signal the conversation is tied to, and whether you're running a backtest or a live trading session. 

You'll need to provide the details of the conversation you want to save, like the bucket name, a unique ID for the dump, the messages themselves, and a brief description of what the conversation was about. The function then takes care of the rest, saving the history for later analysis.


## Function createSignalState

The `createSignalState` function helps you manage and track the state of a trading signal, especially useful when building strategies driven by AI or large language models. It gives you a pair of functions – `getState` and `setState` – that let you access and update the signal's data.

A key advantage is that these functions automatically know whether the system is in backtesting or live trading mode, so you don't need to pass signal IDs around.

This function is particularly designed for strategies that collect data from each trade, such as how high a trade goes (peak percent) or how long it stays open. It's built to work well with strategies aiming for modest profits and tight risk controls, and to quickly exit trades that aren't performing as expected. 


## Function commitTrailingTakeCost

This function helps you set a specific take-profit price for a trade. It's designed to adjust a trailing take-profit to a fixed price level, calculating the necessary shift from your original take-profit distance. It handles the details of figuring out whether you're in a backtesting environment or live trading and automatically gets the current price to ensure accurate calculations. You just need to provide the trading symbol and the target take-profit price you want to set.

## Function commitTrailingTake

This function helps you fine-tune your take-profit levels for pending trades. It's designed to adjust the distance of your take-profit order, but with a key rule: it always calculates changes based on the original take-profit distance you set when the trade was initially placed.

To avoid small errors from adding up over time, the function prioritizes more conservative (closer to entry) take-profit adjustments. This means that if you try to move your take-profit further away, it will only do so if the new level is even more conservative than the current one.

When managing long positions, the function only allows you to tighten your take-profit (move it closer to entry).  For short positions, it only allows you to widen it.

It also knows whether it's operating in a backtesting environment or live trading mode without you needing to specify.  You provide the trading pair's symbol, a percentage adjustment for the take-profit distance, and the current market price as input.

## Function commitTrailingStopCost

This function lets you set a specific stop-loss price for a trade, regardless of its current price. It's designed to simplify setting a stop-loss at a fixed price point. 

It handles some of the tricky details for you, like figuring out whether you're in a testing or live trading environment and getting the current market price.

Essentially, it takes your desired stop-loss price and automatically calculates how much to adjust the percentage shift of the original stop-loss distance to reach that price.


## Function commitTrailingStop

This function helps you refine your trailing stop-loss orders for a trading signal. It allows you to adjust the distance of your stop-loss based on a percentage change relative to the original stop-loss distance you initially set.

It’s important to remember that the adjustment is always calculated from the *original* stop-loss level, not any existing trailing stop-loss, preventing issues that can arise from multiple adjustments.

When you call this function, if the calculated new stop-loss level would provide more protection (a better position for safeguarding profits), it will be applied. Otherwise, it won't change the existing stop-loss.

For long positions, it only moves the stop-loss higher, and for short positions, it only moves it lower. The function automatically recognizes whether you are in a backtest or live trading environment.

You provide the symbol of the trading pair, the percentage shift you want to apply, and the current market price.

## Function commitSignalNotify

The `commitSignalNotify` function lets you send out informational messages related to your trading strategy. Think of it as a way to add notes or alerts during a backtest or live trade, without actually changing your positions. 

It's handy for things like marking when a specific technical indicator hits a certain level, or for sending out custom alerts. 

The function automatically knows which strategy, exchange, and timeframe it's operating in, and also retrieves the current price. You just need to specify the symbol you're trading and can add additional details to the notification if you want.

## Function commitPartialProfitCost

This function lets you partially close a trade when you've reached a specific profit target, expressed as a dollar amount. It simplifies the process by automatically calculating the percentage of your position to close based on the dollar amount you specify. 

It's designed to move your trade closer to your take profit level, and it handles some of the technical details like determining whether you're in a backtest or live trading environment, and fetching the current price of the asset.  You just tell it which trading pair and how much profit in dollars you want to lock in.


## Function commitPartialProfit

This function lets you automatically take some profits during a trade. It closes a portion of your open position when the price is moving in the direction of your take profit target. You specify which symbol you’re trading and what percentage of the position you want to close. The framework handles whether it's being used in a backtest or a live trading environment.

## Function commitPartialLossCost

This function lets you partially close a trading position to limit losses, by specifying a precise dollar amount. It's a helpful shortcut – you tell it how much money you want to recover, and it calculates the corresponding percentage of your position to close.

Think of it as a way to gradually move toward your stop-loss order.

It handles the technical details for you: it knows whether you're in a testing environment or a live trading situation, and it automatically gets the current market price.

You provide the trading symbol and the dollar amount you want to recover. For example, `commitPartialLossCost('BTCUSDT', 100)` would close a portion of the position to recover $100.


## Function commitPartialLoss

This function lets you automatically close a portion of an open trade when the price moves in a direction that heads towards your stop-loss order. It's designed to help manage risk by closing some of the position even before the stop-loss is triggered.

You specify the trading symbol and the percentage of the position you want to close. The percentage should be a number between 0 and 100.

The function intelligently determines whether it's running in a backtesting or live trading environment and handles the closing accordingly. 


## Function commitClosePending

This function lets you manually close a pending order signal in your trading strategy without interrupting its normal operation. Think of it as clearing a signal you previously set up but no longer want to execute. It won't stop the strategy from generating new signals, nor will it affect any signals already scheduled. You can optionally include extra information with the closure, like an ID or a note for record-keeping. The system knows whether it's running in a backtest or a live trading environment and adjusts accordingly.


## Function commitCancelScheduled

This function allows you to cancel a previously scheduled trading signal without interrupting the overall strategy execution. Think of it as pausing a future action, like removing a reminder from your calendar. It won't affect any signals that are already in progress or stop the strategy from generating new signals – it's a targeted cancellation. It handles whether you're in a testing or live trading environment automatically. You can optionally include extra information, such as an ID or a note, with the cancellation if needed.

## Function commitBreakeven

This function helps manage your trades by automatically adjusting the stop-loss order. It moves the stop-loss to the entry price, essentially removing the risk, once the price has moved favorably enough to cover the costs associated with the trade, like slippage and fees. 

Think of it as a safety net – once your trade is comfortably in profit, it protects your gains without requiring manual intervention. The specific threshold for triggering this change is based on a calculation that considers slippage and fee percentages.

The process handles the necessary details, automatically detecting whether it's running in a backtest or live environment and retrieving the current price. You only need to specify the trading pair symbol to use the function.


## Function commitAverageBuy

The `commitAverageBuy` function lets you record a new purchase in your dollar-cost averaging (DCA) strategy. It essentially adds an entry to your trading history, noting that you bought at the current market price. 

This function automatically figures out if you're running a backtest or a live trade and uses the `getAveragePrice` function to determine the purchase price. 

You provide the trading pair symbol (like 'BTCUSDT') and can optionally specify a `cost` value. After adding the entry, the function calculates the average purchase price across all your DCA buys and sends out a signal indicating that a new average buy has been committed.


## Function commitActivateScheduled

This function lets you trigger a scheduled trading signal before the price actually reaches the target level you initially set. It's useful when you need to proactively manage your trades, perhaps due to anticipated market movements.

Think of it as a way to "jumpstart" a scheduled order.

You provide the symbol of the trading pair you're working with, and optionally include information like a unique identifier or a note for your records. The framework handles whether it's running a backtest or a live trading session automatically. The activation then takes effect on the next price update.


## Function checkCandles

The `checkCandles` function helps verify that your historical price data, which is stored separately, is available and complete. It efficiently checks if the data needed for a backtest exists without having to load the entire dataset. This function is crucial for ensuring your backtest has all the necessary information before it begins. 

It works by querying the data storage (using the "persist adapter") to see if candles are present for the specific timestamps you expect. If even one candle is missing or out of sync, the function will report it, saving you time and resources. 

The `params` argument contains the specific settings and criteria used to perform this check.

## Function cacheCandles

The `cacheCandles` function helps keep your historical price data, or "candles," up-to-date and available for backtesting. It verifies if the data you need exists, and if not, it automatically fetches and validates it, ensuring you have a complete record. Think of it as a system that double-checks and refills your data storage to prevent errors during analysis. You specify the asset (symbol), timeframe (interval), date range (from and to), exchange, and optional callbacks to monitor progress. The process includes an initial check and a follow-up 'warm-start' phase to guarantee accuracy.


## Function addWalkerSchema

This function lets you register a custom "walker" that will help compare different trading strategies. Think of a walker as a way to run multiple backtests – essentially, testing out different strategies – all at once on the same historical data.  It then analyzes the results and looks at how each strategy performed based on a metric you define. You provide a configuration object, `walkerSchema`, which tells the system how to set up and run this comparison process.

## Function addStrategySchema

This function lets you tell the backtest-kit framework about a new trading strategy you've created. Think of it as registering your strategy so it can be used for backtesting or live trading.

When you register a strategy, the framework will automatically check to make sure your strategy's signals are well-formed – verifying things like price data, stop-loss/take-profit logic, and timestamps.

It also handles rate limiting to avoid overwhelming the system and ensures your strategy's data is safely stored, especially when running in live mode.

You pass in a configuration object, which defines all the details of your strategy, and the framework takes care of the rest.

## Function addSizingSchema

This function lets you tell the backtest-kit system how to determine the size of your trades. You provide a sizing schema, which is a set of rules and parameters. 

This schema dictates things like how much of your capital to risk on each trade, what method to use for calculating position sizes (like a fixed percentage, a Kelly criterion, or based on Average True Range), and any limits you want to place on the size of those positions. Think of it as setting up the guidelines for how aggressively or conservatively your trading strategy will operate. It's essential for controlling risk and ensuring your strategy aligns with your overall investment goals.


## Function addRiskSchema

This function lets you define how your trading system manages risk. Think of it as setting up guardrails for your strategies. You can specify limits on how many trades can be active at once and even implement custom checks to ensure your portfolio stays healthy – perhaps monitoring correlations between assets or tracking specific metrics. When a trading signal is rejected or allowed based on these risk rules, callbacks can be triggered, providing you with further insight and control. It's designed so that multiple trading strategies can share and be influenced by the same risk management rules, offering a holistic view of your overall exposure.

## Function addFrameSchema

This function lets you tell the backtest-kit about a new timeframe generator you want to use. Think of it as registering a way to create the specific time periods (like daily, weekly, or monthly) your backtest will analyze. 

You provide a configuration object that details how these timeframes should be generated, including the start and end dates of your backtest, the interval for timeframe creation, and a function that will be called during the timeframe generation process. This allows for flexible and customized time period creation within your backtesting strategy.

## Function addExchangeSchema

This function lets you tell backtest-kit about a new exchange you want to use for backtesting. Think of it as registering a data source – you're telling the system where to get historical price data and how to handle things like formatting prices.  The registered exchange needs to provide a way to fetch historical candles, handle price and quantity display, and can calculate a VWAP (Volume Weighted Average Price) using the most recent five one-minute candles.  You provide the exchange's configuration details through the `exchangeSchema` parameter, which outlines how backtest-kit should interact with that specific exchange.


## Function addActionSchema

This function lets you register handlers for actions within the backtest-kit framework. Actions are a powerful way to react to events happening during your backtesting, allowing you to integrate with external systems like state management libraries, send notifications, log events, or trigger custom logic. Think of them as event listeners that automatically get triggered by significant milestones in your strategy's execution, such as when a signal is generated or when profit targets are reached. Each action handler gets a unique instance based on the specific strategy and the timeframe being tested, providing focused information about that instance’s events. To use it, you provide a configuration object that defines the specifics of how the action should be handled.
