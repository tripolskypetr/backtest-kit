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

The `writeMemory` function lets you store data persistently within your backtest or trading strategy. Think of it as saving information to a designated memory location – like a labeled box – so you can retrieve it later. 

It identifies the symbol being traded and the specific signal associated with the operation. If no signal is active, it will notify you to ensure you're writing to the correct context.

Crucially, it adapts to whether you're in a backtesting simulation or live trading environment automatically.

To use it, you provide a data object, a bucket name, a unique memory ID, the value you want to store, and a descriptive label for what the data represents. This helps keep your memory organized and understandable.


## Function warmCandles

This function helps speed up your backtesting by pre-loading historical price data, also known as candles. It downloads candles for a specific time period, from a starting date to an ending date, and stores them so they're readily available when you run your backtests. Think of it like preparing ingredients before you start cooking – it avoids delays during the actual backtest execution. You'll provide details like the start and end dates and the trading interval you want to cache.

## Function validate

This function helps make sure everything is set up correctly before you run a backtest or optimization. It checks that all the things your strategy uses – like exchanges, frames, strategies, and risk managers – actually exist and are registered in the system.

You can tell it which specific items to check, or if you leave it blank, it will check everything.

Think of it as a final check to avoid errors later on; it saves time by catching potential problems early. The results of these checks are saved so it runs faster the next time.

## Function stopStrategy

This function gracefully pauses a trading strategy's signal generation. 

It doesn't immediately shut everything down; any existing signals will finish their course. The system will automatically figure out whether it's running a backtest or a live trading session and stop at a safe, convenient point, like when it's idle or a signal has concluded. You just need to provide the trading symbol to specify which strategy to stop.

## Function shutdown

This function lets you safely end the backtesting process. It sends out a signal to tell all parts of the system that it's time to wrap up. This means things like closing connections or saving final data can happen before the program stops, making sure everything is handled properly. It's often used when you want to stop the backtest, like when you press Ctrl+C.

## Function setLogger

You can now control where and how your backtesting logs appear. This function lets you plug in your own logging system, like sending logs to a file, a database, or a monitoring service. The framework will automatically add useful information to each log message, such as the trading strategy name, the exchange being used, and the symbol being traded – making it easier to understand what's happening during your backtests. Simply provide an object that follows the `ILogger` interface, and the framework will handle the rest.

## Function setConfig

This function lets you adjust the overall settings of the backtest-kit framework. Think of it as tweaking the engine before your trading strategy runs. You provide a set of configuration values, and this function updates the global settings to match. The `_unsafe` flag is a special setting used primarily in testing environments to bypass some of the safety checks, allowing for more flexible configuration.

## Function setColumns

This function lets you customize the columns that appear in your backtest reports, like the ones generated for markdown. You can change how certain data points are displayed or even add your own columns. It's a way to tailor the reports to show exactly the information you need.

The `columns` parameter lets you specify your desired configuration, and it checks to make sure your changes are valid, preventing errors. 

If you're working in a testing environment where you need to bypass those validations, there's an optional `_unsafe` flag to skip them.

## Function searchMemory

The `searchMemory` function helps you find related memory entries based on a search query. It’s designed to sift through your stored data and return results ranked by relevance. 

Essentially, you provide a bucket name (where the memory is stored) and a search query, and it finds entries matching that query.

The function automatically figures out whether it's running in a backtest or live environment and pulls necessary information like the trading symbol and signal ID.

If there's no active signal to search against, it will let you know with a warning message, and won't return any results. The data it returns includes the memory ID, a relevance score, and the content of the matching memory entry. You can also specify the structure of the content using generics for type safety.


## Function runInMockContext

The `runInMockContext` function lets you execute pieces of code as if they were running within a backtest or trading environment, but without actually needing a full backtest setup. It's great for testing code that relies on context like the current time or information about the trading strategy.

You can customize the mock environment by providing details like the exchange name, strategy name, symbol, and whether you want a live or backtest mode. If you don't provide these details, it creates a minimal live-mode environment with placeholder names and the current minute.

Essentially, it provides a safe and convenient way to isolate and test components that depend on the trading context. You pass in a function you want to run, and it runs that function within the configured mock environment.


## Function removeMemory

This function lets you delete a specific memory entry associated with a signal. 

It finds the symbol and signal ID automatically based on the current environment and any pending signals.

If there isn't a pending signal available, it will simply log a warning and won't do anything.

Essentially, it cleans up memory entries when they're no longer needed, working whether you’re in backtest or live mode.

To use it, you’ll provide the bucket name and the unique ID of the memory entry you want to remove.


## Function readMemory

The `readMemory` function helps you retrieve data that's been stored for a specific trading signal. Think of it as accessing a named storage location linked to your signal.

You provide the function with the name of the memory "bucket" and a unique identifier for the specific item you want.

It smartly figures out whether you're running a backtest or a live trade.

If no signal is actively waiting, it will let you know with a warning and return nothing, so you know something might be amiss. 

Essentially, it's a tool for accessing previously saved data related to your trading strategy’s signals.

## Function overrideWalkerSchema

This function lets you tweak an existing strategy’s "walker" – that's the part of the backtest that explores different combinations of parameters. Think of it as refining an experiment setup.

You provide a partial set of changes to the walker's configuration, and the function updates the original walker, keeping everything else as it was.  It’s useful for making small adjustments to the search space without completely redefining the walker. The `walkerSchema` parameter accepts a subset of the walker configuration options.


## Function overrideStrategySchema

This function lets you tweak existing strategies within the backtest-kit framework. Think of it as a way to modify a strategy's settings without completely replacing it. You provide a new set of configuration details, and only those specific details are updated in the existing strategy – the rest stays as it was. It's useful for making smaller adjustments or updates to strategies over time.

## Function overrideSizingSchema

This function lets you tweak an existing position sizing setup. Think of it as making small adjustments to how much of your capital gets used for each trade. You don’t have to redefine the whole sizing configuration; instead, you just specify the parts you want to change. This is useful when you want to refine your sizing strategy without rebuilding it from scratch. It takes a partial sizing configuration as input, updating the original and returning the modified version.

## Function overrideRiskSchema

This function lets you adjust an already existing risk management plan. Think of it as making targeted changes to a risk profile that's already been set up. You don't have to redefine everything; you just specify the parts you want to update. It's useful for fine-tuning your risk controls without completely restarting. The function takes a partial configuration – only the pieces you want to change need to be included.

## Function overrideFrameSchema

This function lets you modify a timeframe configuration that's already set up for your backtesting. Think of it as making adjustments to an existing plan – you can change specific parts of it, like the data fields included, but the rest of the configuration stays as it was. You provide a piece of information about how you want the timeframe to look, and this function updates the existing timeframe with just those changes. It's useful when you need to tweak things without completely recreating the timeframe from scratch.

## Function overrideExchangeSchema

This function lets you modify an already set up data source for an exchange within the backtest-kit framework. 

Think of it as a way to tweak existing exchange settings without having to rebuild the whole thing.

You provide a partial configuration – just the bits you want to change – and the function updates the existing exchange schema, keeping everything else as it was. This is useful for adjustments and fine-tuning without a complete overhaul. It accepts an object containing the specific configuration details you'd like to apply.

## Function overrideActionSchema

This function lets you tweak existing action handlers in the backtest-kit framework without completely replacing them. Think of it as a targeted update – you specify which parts of the handler's configuration you want to change, and only those parts are modified. It’s great if you need to adjust how actions are handled, perhaps for different environments like development versus production, or to experiment with different handler implementations on the fly. You can use it to update event logic or modify callbacks without needing to re-register the entire action handler.

## Function listenWalkerProgress

This function lets you track the progress of a backtest as it runs through different trading strategies. It provides updates after each strategy finishes, so you can monitor how things are going. Importantly, the updates are delivered one at a time, even if your code takes some time to process each one, ensuring smooth and predictable behavior. You provide a function that gets called with details about each strategy's completion, and it returns a function to unsubscribe from these updates.

## Function listenWalkerOnce

`listenWalkerOnce` lets you monitor the progress of a walker, but only until a specific event happens. It’s like setting up a temporary listener that reacts to events based on your defined criteria. Once the listener finds an event that matches your filter, it runs the provided callback function and then silently stops listening. This is perfect for situations where you need to react to a particular condition within the walker's progress and then move on.

You provide a filter function (`filterFn`) to specify which events should trigger the callback. The callback function (`fn`) then handles that specific event. After the callback runs once, the listener automatically removes itself, preventing further callbacks.


## Function listenWalkerComplete

This function lets you be notified when a backtest run finishes. It's like setting up a listener that gets triggered once all the strategies in your backtest are done being evaluated. 

Importantly, it handles events in the order they come in, and it makes sure your notification function runs one at a time, even if that function itself takes some time to complete. This ensures that things don't get messed up by running multiple callbacks concurrently. You provide a function that will be called with details about the completed backtest when it's done.


## Function listenWalker

The `listenWalker` function lets you tap into the progress of a backtest, receiving updates as each strategy finishes running. It’s designed for situations where you need to react to each strategy's completion, but you want to avoid potential issues that can arise from running callbacks concurrently.

Essentially, it provides a way to be notified in a controlled and sequential manner.

You provide a function (`fn`) that will be called with information about the completed strategy. This function can be asynchronous – `listenWalker` handles queuing the execution to ensure things happen one at a time. The function you provide will receive `WalkerContract` events.

To stop listening, the function returns another function that you can call to unsubscribe.

## Function listenValidation

This function lets you keep an eye on potential problems during the risk validation process, which is how your trading strategies are checked for safety. It’s a way to catch errors that happen when your strategies are being evaluated.

Whenever a validation error occurs, this function will trigger a callback, allowing you to log the error, send alerts, or perform other debugging actions. The errors are handled one at a time, sequentially, to ensure that no validations are skipped. 

You provide a function that will receive the error information when something goes wrong, and this function returns another function that you can call to unsubscribe from these error notifications.


## Function listenSyncOnce

This function lets you set up a listener that only runs *once* for signals that match a specific condition. Think of it as a temporary hook into the trading process. 

It's designed to help you coordinate with other systems – for example, you might use it to immediately update an external database when a certain trade condition is met.

The function takes a filter—a test to see if a signal is relevant—and a callback function that gets executed *just once* when the filter matches. If your callback returns a Promise, the system will pause until that promise resolves before continuing. This ensures any external operations complete before the next step in the trading process. 

You can also provide a 'warned' flag, but the details of that are implementation-specific. The function returns a cleanup function that you can use to unsubscribe from the listener whenever you no longer need it.

## Function listenSync

The `listenSync` function lets you react to events as they happen during the trading process, specifically when signals are being synchronized. Think of it as a way to keep external systems in the loop. 

It provides a callback function that's triggered whenever signals are being prepared for opening or closing trades. Critically, if the callback returns a promise, your trading execution will pause until that promise resolves – ensuring everything stays in sync. This is incredibly useful if you need to confirm actions with another service or perform checks before proceeding. It gives you a way to control the timing of signal processing.


## Function listenStrategyCommitOnce

This function lets you watch for specific strategy changes and react to them, but only once. 

You provide a filter to define what changes you're interested in, and then a function to run when that change happens. 

Once the matching change occurs, your function will execute, and the listener automatically stops, so you won't get further notifications. It's a clean way to respond to a single, specific event related to your strategy. 

The function returns a way to stop the listener manually if you need to.


## Function listenStrategyCommit

This function lets you tap into what's happening with your trading strategy as it's being managed. It's like setting up a listener that gets notified whenever your strategy adjusts its positions – for example, when a scheduled trade is canceled, a trade is partially closed for profit or loss, or when stop-loss and take-profit levels are modified. The listener handles these updates one at a time, even if your callback function takes some time to process the information, ensuring things happen in the correct order and safely. You provide a function that will be called whenever one of these events occurs, and this function will be executed whenever the respective events happen. The function returns a function that you can call to unsubscribe from these events.

## Function listenSignalOnce

The `listenSignalOnce` function lets you temporarily listen for specific signals within your trading strategy. Think of it as setting up a short-term alert – it waits for a signal that meets your criteria, runs a function once when it finds it, and then automatically stops listening. This is handy when you need to react to a particular market condition just one time. You provide a filter to define what kind of signal you’re looking for, and a function to execute when that signal arrives. It's a clean way to handle single, important events without managing subscriptions manually.


## Function listenSignalNotifyOnce

This function lets you listen for specific trading signals and react to them just once. You provide a filter to define which signals you're interested in, and a function that will be executed when a matching signal arrives. Once that function runs, the listener automatically stops, so you won't get triggered again by the same signal. It's a clean way to handle one-off signal responses.

The filter function determines which signals will trigger the callback. The callback function then processes the signal information.

## Function listenSignalNotify

This function lets you listen for notifications when a trading strategy sends out information about signals. Think of it as being notified when a strategy wants to share a note related to an active trade. These notifications are handled in order, ensuring that even if your notification processing takes some time, everything happens sequentially to avoid conflicts. It provides a way to receive and process these signal updates, preventing multiple actions from happening at the same time. You provide a function that gets called with the signal information whenever this happens. When you’re done listening, the function returns another function you can call to unsubscribe.

## Function listenSignalLiveOnce

This function lets you temporarily listen for specific trading signals coming directly from a live trading execution. 

Think of it as setting up a short-term alert that only triggers once when a signal meets your criteria. 

You provide a filter – a way to define which signals you're interested in – and a callback function that will be executed just once when a matching signal arrives. After that one execution, the subscription automatically stops, so you don't need to worry about cleaning up.


## Function listenSignalLive

The `listenSignalLive` function lets you hook into the live trading events generated when you’re running a backtest with `Live.run()`. Think of it as a way to be notified whenever your strategy produces a trading signal during a live test. It ensures that these signal events are handled one at a time, in the order they arrive, which is useful for processing them reliably. You provide a function that will be called with each signal event as it happens. When you're done listening, the function returns another function that you can call to unsubscribe.

## Function listenSignalBacktestOnce

This function lets you temporarily "listen in" on the events happening during a backtest run, but only once. You provide a filter – essentially, a rule – to specify which events you're interested in. When an event matching that rule occurs, a callback function you define gets executed with the details of the event. After that single execution, the function automatically stops listening, so it's great for quickly grabbing a specific piece of data without ongoing subscriptions. It works exclusively with events generated during a `Backtest.run()` call.

## Function listenSignalBacktest

This function lets you tap into the flow of your backtest simulations and react to what's happening. It sets up a listener that gets triggered whenever your backtest generates a signal – think of it as a way to observe the simulation as it runs.

The listener function you provide will receive data about each signal event, giving you insights into the trading process. Importantly, these events are handled one after another, ensuring they are processed in the order they occurred.

Keep in mind that this only works with backtests started through the `Backtest.run()` method. It's a useful tool for debugging, real-time monitoring, or building custom visualizations alongside your backtest. To stop listening, the function returns a cleanup function that you can call to unsubscribe.


## Function listenSignal

This function lets you tap into all the signals your trading strategy generates—things like when a position is opened, active, or closed. 

It makes sure these signals are handled one at a time, even if the code you write to handle them takes some time to complete. 

You provide a function that will be called whenever a new signal occurs, and that function receives data about the event. 

The function you provide will also return a function that, when called, will unsubscribe from these signals.


## Function listenSchedulePingOnce

This function lets you react to specific ping events, but only once. It acts like a temporary listener, waiting for a condition you define, then running your code once when that condition is met. After that, it automatically stops listening, so you don't need to manage the subscription yourself.

You provide a filter to identify the events you’re interested in, and a function to execute when a matching event arrives. Think of it as a way to set up a one-time alert for a particular type of ping.


## Function listenSchedulePing

The `listenSchedulePing` function lets you keep an eye on scheduled signals as they wait to become active. It’s like setting up a little listener that gets notified every minute while a scheduled signal is being monitored. 

You provide a function that will be called with each of these "ping" events.

This allows you to build custom monitoring logic or simply track the progress of a scheduled signal’s lifecycle.

The function returns another function you can call to stop listening.


## Function listenRiskOnce

This function helps you react to specific risk rejection events, but only once. You provide a filter that defines which events you're interested in, and a function that will be executed when a matching event occurs. Once that one event triggers your function, the listener automatically stops listening. It’s perfect for situations where you need to react to a particular risk condition just one time and then move on.

The filter function determines if an event should be processed, and the callback function handles the data when a matching event is found.

## Function listenRisk

The `listenRisk` function lets you be notified when a trading signal is blocked because it doesn't meet risk criteria. 

Think of it as a way to react specifically when something goes wrong with your risk checks. 

It won't notify you when signals *are* okay, only when they’re rejected.

Events are handled one at a time, ensuring your reaction to a rejected signal isn’t overwhelmed by multiple issues.

You provide a function that gets called when a risk rejection event occurs, and `listenRisk` returns a function you can use to unsubscribe later.

## Function listenPerformance

This function lets you keep an eye on how your trading strategies are performing in terms of speed. It's like setting up a listener that gets notified whenever your strategy completes an action and records how long it took.

You provide a function that will receive these performance updates – essentially a way to track timing data.

These updates are handled one at a time to ensure things are processed correctly, even if the function you provide takes some time to run. This helps you pinpoint areas where your strategy might be slow and potentially improve its efficiency.


## Function listenPartialProfitAvailableOnce

This function allows you to monitor for specific partial profit levels and react to them just once. You provide a filter – essentially, a set of conditions – and a function to execute when a matching event occurs. Once that event is detected, the callback runs, and the subscription automatically ends, preventing repeated triggers. It's ideal for scenarios where you only need to respond to a particular profit condition once.

The `filterFn` defines which events you're interested in. The `fn` is the code that gets run when a matching event is found.

## Function listenPartialProfitAvailable

This function lets you monitor your trading strategy’s progress toward profit targets. It will notify you when the strategy hits specific profit levels, like 10%, 20%, or 30% gain. 

Importantly, these notifications are handled in a carefully controlled order, ensuring that even if your notification code takes some time to run, everything happens as expected without any clashes. You provide a function that gets executed each time a profit milestone is reached, and this function receives data about the event. You can unsubscribe from these events later by calling the function it returns.

## Function listenPartialLossAvailableOnce

This function lets you set up a one-time listener for changes in partial loss levels. You provide a filter to specify what conditions you're looking for, and a function to run when that condition is met. It's like saying, "Hey, notify me *only* when this specific loss scenario happens, then stop listening." Once the event you’re waiting for occurs, your provided function is executed, and the listener automatically stops – it won’t keep reacting to other events. This is handy for situations where you need to respond to a specific event just once and then move on.


## Function listenPartialLossAvailable

This function lets you monitor your trading strategy's progress in terms of losses. It keeps track of milestones like reaching 10%, 20%, or 30% loss levels. Whenever one of these milestones is hit, it will call a function you provide.

Importantly, the events are handled one at a time, even if the function you provide takes some time to execute. This ensures that events are processed in the order they occur and avoids potential conflicts. To stop listening for these events, the function returns another function that you can call to unsubscribe. The function takes a callback that receives information about the partial loss event.

## Function listenMaxDrawdownOnce

This function helps you monitor for specific maximum drawdown events within your backtesting environment and react to them just once. It's like setting up a temporary alert – you define what conditions you're looking for, and when those conditions are met, a function runs and then the alert automatically goes away. This is perfect if you need to take action based on a particular drawdown threshold occurring just one time during your backtest.

You provide a filter to identify the exact drawdown events you're interested in, and a function to execute when a matching event occurs. Once that event is detected and the function has run, the monitoring stops automatically.


## Function listenMaxDrawdown

This function lets you listen for when your trading strategy hits a new maximum drawdown. Think of it as a way to get notified when your losses reach a certain point.

It ensures that these notifications happen one at a time, even if the notification process itself takes a bit of time.

You provide a function that will be executed whenever a new maximum drawdown is detected, allowing you to react to changes in risk exposure. This is great for managing risk and understanding how your strategy performs under pressure.

## Function listenIdlePingOnce

This function lets you react to moments when your application is relatively inactive, known as "idle pings." It's designed to trigger a specific action just *once* when a particular idle ping condition is met.

You provide a filter – essentially, a set of rules – to decide which idle ping events you’re interested in. Then, you define a function that will run only when an idle ping matches your filter.

Once an event matches, the provided function executes, and then the subscription is automatically removed, ensuring it only runs once. This is useful for things like triggering a quick data refresh or performing a small task when resources are available. 

The function returns a cleanup function that you can call if you want to unsubscribe manually.

## Function listenIdlePing

The `listenIdlePing` function lets you get notified when the backtest kit is completely idle – meaning there are no trades currently being processed or scheduled. Think of it as a signal that everything is quiet and the system is ready for new instructions. You provide a function (`fn`) that will be called each time an idle ping event occurs, and this function will receive details about the event through an object called `IdlePingContract`.  The function you provide returns a way to unsubscribe from these idle ping notifications when you no longer need them.

## Function listenHighestProfitOnce

This function lets you set up a temporary listener that reacts only when a specific highest profit event occurs. You provide a filter – a rule to identify the events you're interested in – and a function to run when that event is found. Once the event is triggered and the function runs, the listener automatically stops, so it only acts once. This is handy when you need to react to a particular profit level and then forget about it. The filter function determines which events trigger the callback, and the callback function handles the event once it's identified.


## Function listenHighestProfit

This function lets you be notified whenever a trading strategy hits a new peak in profit. It's like setting up an alert that triggers whenever the strategy earns more than it ever has before.

The alerts you receive will be in order, and they'll be handled one at a time, even if the notification process takes some time. This ensures things stay predictable and avoids unexpected behavior.

You can use this to monitor your strategy's profitability, adjust parameters, or trigger other actions based on its performance. To use it, you simply provide a function that gets called with the details of each new highest profit event. When you're done listening, the function returns another function that you can call to unsubscribe.

## Function listenExit

This function lets you react to truly critical errors that can halt a backtest or live trading process. Think of it as an emergency alert system for your trading framework. These aren't the little hiccups you can recover from – these are errors that cause the whole thing to stop.

It ensures that when an error occurs, your response is handled one at a time, in the order they happen, preventing unexpected issues with your error handling logic.
You provide a function that will be called when a fatal error occurs, giving you a chance to log the error, potentially clean up resources, or otherwise respond appropriately. Importantly, this subscription will be removed when the process ends.


## Function listenError

This function helps you catch and deal with errors that happen while your trading strategy is running, but aren't serious enough to stop the whole process. Think of it as a safety net for potential hiccups like problems connecting to an API. It will notify you when these recoverable errors occur, allowing you to log them or take corrective actions without interrupting your strategy's execution. The errors are handled one at a time, ensuring a controlled and sequential response. To use it, you provide a function that will be called whenever an error needs attention.

## Function listenDoneWalkerOnce

This function lets you react to when a background process finishes, but only once. 

You provide a filter – a way to select the specific completion events you're interested in. 

Then, you define a callback function that will be executed when a matching event occurs.

Once the callback has run once, the subscription automatically stops, preventing further calls. It's a convenient way to perform a single action based on a background task's completion.

## Function listenDoneWalker

This function lets you monitor when background tasks managed by the walker complete. 

Think of it as setting up a listener that gets notified when a process finishes running in the background. 

It guarantees that the notification is delivered in the order it was received, and it makes sure your callback function runs one at a time, preventing any clashes. You provide a function (`fn`) that will be executed when the background task is done. The function you provide will receive information about the completed event. To stop listening, the function returns another function that you can call.


## Function listenDoneLiveOnce

`listenDoneLiveOnce` lets you react to when a background task finishes, but only once. 

You provide a way to determine which completion events you're interested in, and a function to execute when a matching event occurs. 

Once your function has run, the subscription is automatically removed, so you don’t have to worry about managing it yourself. This is useful for single, specific reactions to background task completion.


## Function listenDoneLive

This function lets you monitor when background tasks initiated by Live.background() are finished. It’s like setting up a listener that gets notified whenever one of those tasks completes. The important thing to know is that these completion notifications happen one after another, even if the function you provide to handle them takes some time to run. This ensures that things are handled in a controlled, sequential order, preventing potential conflicts. To use it, you simply provide a function that will be executed when a background task is done. When you no longer need the notifications, you can use the function returned by `listenDoneLive` to unsubscribe.

## Function listenDoneBacktestOnce

This function lets you react to when a background backtest finishes, but only once. You provide a filter to specify which backtest completions you’re interested in, and a function that will be executed when a matching backtest is done. Once that callback runs, it automatically stops listening, so you don't have to worry about cleaning up the subscription. It's perfect for actions you need to take immediately after a particular backtest completes, and only need to happen once.


## Function listenDoneBacktest

This function lets you be notified when a background backtest finishes running. It’s like setting up an alert that triggers when the backtest is complete. The notification will include details about the completed backtest. 

Importantly, the notifications are handled in the order they come in, and even if your callback function takes some time to complete (like if it involves asynchronous operations), it won’t interfere with other notifications. You provide a function that will be called when the backtest finishes. The function you provide is then returned, and you can call that returned function to unsubscribe from the event.

## Function listenBreakevenAvailableOnce

This function lets you set up a listener that reacts to changes in breakeven protection, but only once. You provide a filter – essentially, a rule that specifies *when* you want to be notified – and a callback function that will run when that condition is met.  Once the callback executes, the listener automatically stops, so you won’t receive any further notifications. It’s a great way to react to a specific, one-time breakeven event and then move on. 

The `filterFn` determines which events qualify, and the `fn` is the action that's taken once a matching event is detected.

## Function listenBreakevenAvailable

This function lets you get notified whenever a trade's stop-loss is automatically moved to the original entry price, essentially protecting your profit. It’s triggered when the trade has gained enough profit to cover all associated costs, like fees. Because these notifications might involve asynchronous operations, the system ensures they are handled one at a time, in the order they occur, to keep things predictable. You simply provide a function that will be called with details about the trade reaching breakeven, and this function will return another function to unsubscribe from those notifications when you no longer need them.


## Function listenBacktestProgress

This function lets you keep an eye on how a backtest is running. It’s like setting up a listener that gets notified as the backtest progresses. 

The listener receives updates during the background processing of the backtest, allowing you to track its advancement. Importantly, these updates are handled one at a time, even if the notification process itself takes some time. 

To use it, you provide a function that will be called with information about the progress, and it returns a function to unsubscribe from updates.


## Function listenActivePingOnce

This function lets you react to specific active ping events, but only once. It's like setting up a temporary listener that fires your code only when a certain condition is met within those ping events, then quietly disappears afterward. You provide a filter to specify which events you're interested in, and a function to execute when that event occurs. Once the event happens and your function runs, the listener automatically stops listening, so you don't have to worry about managing subscriptions yourself. This is perfect for scenarios where you need to respond to a single occurrence of a particular ping condition.


## Function listenActivePing

This function lets you keep an eye on active signals in your backtest. It listens for events that happen every minute, providing updates on the status of those signals. This is helpful if you need to adjust your trading strategies based on how those signals are performing. 

Think of it as subscribing to a notification system – whenever a signal changes state, your function will be called. Importantly, the events are handled one at a time, even if your function takes a bit of time to process, ensuring things don't get out of order or overwhelmed. You simply provide a function that will be called when a new active ping event arrives.

## Function listWalkerSchema

This function gives you a look at all the different trading strategies or "walkers" that your backtest kit is set up to use. 

It gathers a list of these registered walkers, providing a way to examine them. 

Think of it as a way to see what options are available for simulating different trading approaches. It's helpful for checking your setup, creating helpful guides, or building user interfaces that adapt to the available strategies.


## Function listStrategySchema

This function helps you see all the trading strategies currently set up within your backtest-kit project. It returns a list of details about each strategy, like what parameters they use and how they're configured. Think of it as a way to get an overview of your strategies without having to manually inspect each one – useful for checking things, building tools, or documenting your setup. It pulls information from the strategies you’ve previously registered using the `addStrategy()` function.


## Function listSizingSchema

This function lets you see all the sizing strategies currently set up in your backtest kit. It essentially gives you a complete list of how your trades will be sized. Think of it as a way to check your sizing configurations or to build tools that need to know about all the different sizing methods you're using. It pulls those configurations directly from the backtest-kit's internal registry.


## Function listRiskSchema

This function lets you see all the risk configurations currently in use. Think of it as a way to peek behind the scenes and view the different ways risk is being managed within your backtest. It fetches a list of these configurations, making it helpful if you're troubleshooting, creating documentation, or building an interface that needs to reflect these settings. Basically, it gives you a comprehensive overview of the registered risk schemas.


## Function listMemory

This function helps you see all the memory entries associated with the current signal. 

It automatically figures out if you're in backtesting or live mode. 

It pulls the symbol from the execution context and the signal ID from the currently active signal. If there's no active signal, it'll let you know with a warning and return an empty list of memory entries. You provide a bucket name to specify where to look for these memories. The function returns a list of objects, where each object includes the memory ID and its content, which can be any kind of data you've stored.


## Function listFrameSchema

The `listFrameSchema` function lets you see all the different data structures (frames) that your backtest kit is using. It essentially gives you a complete inventory of the "shapes" of data being tracked during a backtest. This is handy for understanding how your system is organized, building tools to display this information, or just double-checking everything is set up correctly. It returns a list of these schema definitions so you can examine them.

## Function listExchangeSchema

This function gives you a look at all the exchanges your backtest kit is set up to use. It's like a quick inventory of the trading venues your simulations can handle.  You can use this to check your setup, generate documentation, or build interfaces that automatically adapt to the exchanges you're working with. It returns a list of information about each registered exchange.


## Function hasTradeContext

This function simply tells you whether the trading environment is ready for actions. 

It checks if both the execution and method contexts are running. 

If it returns `true`, you can safely use functions like `getCandles` or `formatPrice` that rely on the trading context being established. If it returns `false`, it means you need to ensure the environment is properly set up before attempting those actions.


## Function hasNoScheduledSignal

This function checks if there's currently a scheduled signal for a specific trading pair, like 'BTC-USDT'. It returns `true` if no scheduled signal exists, which is helpful for making sure your signal generation logic only runs when appropriate. Think of it as the opposite of `hasScheduledSignal`; it's a safety check to prevent unexpected behavior. It figures out whether you're in backtesting mode or live trading automatically. You just need to provide the symbol you're interested in.

## Function hasNoPendingSignal

This function checks if there's currently no pending signal for a specific trading pair. Essentially, it's the opposite of `hasPendingSignal` – use it when you want to make sure a new signal isn't generated when one isn't already waiting. It will automatically figure out if the system is in backtest or live mode without you needing to specify it. You just pass in the symbol of the trading pair you're interested in, and it will tell you whether or not a signal is currently pending.

## Function getWalkerSchema

The `getWalkerSchema` function helps you find the blueprint, or schema, for a specific trading strategy, which we call a "walker."  Think of it as looking up the definition of a walker – what data it needs, what calculations it performs, and how it interacts with the trading environment. You provide the name of the walker you're interested in, and it returns a detailed description of its structure and required components. This lets you understand how a walker is built and what it expects.


## Function getTotalPercentClosed

This function helps you understand how much of a trading position is still open. It tells you what percentage of your initial position remains, with 100% meaning you haven't closed any part of it and 0% meaning it’s completely closed.

It's particularly useful if you've used dollar-cost averaging (DCA) because it correctly factors in those smaller entries when calculating how much has been closed.

The function figures out whether it's running in a backtesting environment or a live trading context without you needing to specify.

You simply need to provide the trading pair symbol (like BTCUSDT) to get the percentage.


## Function getTotalCostClosed

This function helps you figure out how much money you've spent on a particular trade, like buying Bitcoin or Ethereum. It calculates the total cost basis in dollars for a position you still hold – meaning it hasn't been completely sold yet.

It’s particularly smart about accounts where you bought things in smaller amounts over time (Dollar-Cost Averaging or DCA). It takes into account any times you’ve already sold off portions of that initial investment.

To use it, you just tell it the symbol of the trading pair – for instance, 'BTCUSDT' – and it will return the total cost as a number. 

The function understands whether it's running in a test (backtest) or a live trading environment, automatically adjusting its behavior as needed.


## Function getTimestamp

This function lets you get the current time, but it behaves differently depending on whether you're running a backtest or a live trade. When you're testing historical data (backtest mode), it gives you the timestamp of the timeframe currently being analyzed. When you’re trading in real-time (live mode), it provides the actual, current timestamp. Essentially, it's a way to reliably know what time it is within the framework's context.

## Function getSymbol

This function allows you to find out what trading symbol your backtest or live trading is currently focused on. It's a simple way to know which asset you're working with, returning the symbol as a promise that resolves to a string. Think of it as a quick lookup to confirm the trading instrument being used.

## Function getStrategySchema

The `getStrategySchema` function helps you find information about a specific trading strategy that's been set up within the backtest-kit framework. Think of it as looking up a blueprint for how a particular strategy is designed. You give it the strategy's unique name, and it returns a structured description of that strategy, outlining its components and how they work together. This allows you to understand the details of a strategy without having to delve into its underlying code.


## Function getSizingSchema

The `getSizingSchema` function helps you find a specific sizing strategy you've registered within the backtest kit. Think of sizing as determining how much of an asset to trade based on various factors. This function takes the name of the sizing strategy you’re looking for and returns the detailed configuration information associated with it. It's a way to access the specifics of how your trading size calculations are set up. You use it to retrieve the schema that dictates how much to trade for each decision.

## Function getScheduledSignal

This function helps you find out what scheduled signals are currently running for a specific trading pair. 

Think of it as checking if a pre-planned trading instruction is active right now.

It will fetch the data for you, and if there's no signal scheduled, it will tell you that by returning nothing. 

The function knows whether it's running in a backtesting environment or a live trading environment and adjusts accordingly.

You just need to provide the symbol of the trading pair you’re interested in.

## Function getRiskSchema

This function helps you find a specific risk profile that's already been set up within the backtest-kit system. Think of it like looking up a named configuration for managing risk. You provide the name of the risk profile you're interested in, and it returns all the details associated with that risk profile, defining things like how much risk is acceptable. It's a simple way to access existing risk management setups.


## Function getRawCandles

The `getRawCandles` function lets you retrieve historical candlestick data for a specific trading pair and timeframe. You can control how many candles you get and the time range you're interested in.

It’s designed to be safe, ensuring that your backtesting doesn't peek into the future.

Here's how you can specify the candles you want:

*   You can provide a start date, end date, and the number of candles.
*   Just providing a start and end date will automatically determine the number of candles.
*   You can specify an end date and the number of candles, and it will calculate the starting date.
*   Giving only the number of candles will use a default starting point based on the current execution context.

The function supports various candle intervals like 1-minute, 5-minute, hourly, and others, and it requires you to provide the symbol (like BTCUSDT) and the interval. Remember that the end date must always be in the past.


## Function getPositionWaitingMinutes

This function helps you check how long a trading signal has been waiting to be put into action. 

It tells you the waiting time in minutes for a specific trading pair, like BTCUSDT.

If there's no signal currently waiting, it will return null.

You simply need to provide the symbol of the trading pair you’re interested in, and the function will do the rest.


## Function getPositionPnlPercent

This function helps you figure out the unrealized profit or loss as a percentage for a trade you're currently holding. It takes into account things like how much you’ve closed off, any dollar-cost averaging, slippage, and fees, to give you a realistic picture. 

If there’s no open trade, it will return null. 

It smartly adjusts based on whether you're in a backtest or live trading environment, and it also grabs the current market price automatically. To use it, you just need to provide the trading pair symbol, like "BTCUSDT".


## Function getPositionPnlCost

getPositionPnlCost helps you understand how much money you’ve potentially gained or lost on a trade that's still open. It calculates this unrealized profit or loss for a specific trading pair.

The calculation takes into account many factors, including the percentage profit or loss, the total cost of your investment, any partial closes you've made, and even potential slippage or trading fees.

If there isn't an open trade to evaluate, the function will return null.

It's smart enough to know if it's running in a backtest or live trading environment and automatically gets the current market price to make its calculations. You simply provide the symbol of the trading pair you’re interested in.

## Function getPositionPartials

getPositionPartials helps you understand how your trading position has been partially closed. It provides a history of partial profit and loss takes, showing you exactly when and how much was closed.

If you haven't executed any partials yet, it will return an empty list. If no signal is currently active, you’ll get null back.

For each partial close, you'll see details like the type of close (profit or loss), the percentage of the position closed, the price it was executed at, the cost basis at that time, and the number of entries that were accumulated by that point. You need to provide the symbol of the trading pair you’re interested in.

## Function getPositionPartialOverlap

This function helps prevent unwanted repeated partial closing of positions. It determines if the current price is close enough to a previously established partial closing price.

Essentially, it checks if the current price falls within a defined tolerance range around existing partial closing prices, ensuring you don't accidentally trigger another partial close at the same price level. 

You provide the symbol and the current price to be evaluated. You can also optionally specify a custom tolerance range (the "ladder") if the default range isn't suitable. The function returns `true` if the current price falls within that range of a previously executed partial close, and `false` otherwise.

## Function getPositionMaxDrawdownTimestamp

This function helps you find out when a particular trading position experienced its biggest loss. It looks at the history of a specific trading pair, like "BTC-USDT", and tells you the exact timestamp—a date and time—when the position hit its lowest point. If there's no active trading signal for that pair, the function won't be able to provide a timestamp and will return nothing. You give it the symbol of the trading pair you're interested in, and it gives you back the date of that maximum drawdown.

## Function getPositionMaxDrawdownPrice

getPositionMaxDrawdownPrice lets you find out the lowest price a specific trade ever hit while it was open. It essentially tells you the biggest loss experienced during the trade's lifetime. If there aren’t any open or past trades for the symbol you request, it will return nothing. You provide the trading pair symbol, like "BTCUSDT," to get this information for that particular trade.

## Function getPositionMaxDrawdownPnlPercentage

This function helps you understand the risk associated with a specific trading position. It calculates the maximum drawdown in percentage terms based on the position’s profit and loss. Essentially, it tells you how far the position's value fell from its peak before recovering.

You provide the trading symbol (like "BTCUSDT") as input.

The function will return a number representing that drawdown percentage. If there's no active trading signal for that symbol, it returns null.


## Function getPositionMaxDrawdownPnlCost

This function helps you figure out the financial hit you took when your trading position reached its lowest point. Specifically, it calculates the profit and loss (PnL) cost, expressed in the currency of the asset being traded, at the moment the position experienced its biggest drawdown. 

It's useful for understanding the risk associated with a particular trade.

If there aren't any active trading signals, the function will return null. 

To use it, you need to provide the trading pair symbol, like "BTCUSDT".


## Function getPositionMaxDrawdownMinutes

This function tells you how far back in time the biggest loss for a particular trading pair occurred, measured in minutes. Think of it as a way to see how long ago things got really bad for a specific trade. The value will be zero if the worst loss just happened. If there's no active trading signal for that pair, the function won't provide a value. You need to specify the trading pair's symbol to use it, like "BTC-USD".

## Function getPositionLevels

getPositionLevels retrieves the prices used for your Dollar-Cost Averaging (DCA) strategy for a specific trading pair. It essentially shows you the prices at which your orders were placed. 

The function returns an array of prices, starting with the initial price at which you began the trade, and followed by any additional prices used when you added more to your position. 

If there's no active trade or signal, the function will return null. If you only made the initial purchase and didn't add any more orders, you'll receive an array containing only the original price. You pass in the symbol of the trading pair to specify which trade you're inquiring about.

## Function getPositionInvestedCount

getPositionInvestedCount lets you check how many times a DCA (Dollar Cost Averaging) order has been executed for a specific trading pair. 

It tells you how many times the price has been averaged in when buying. 

A value of 1 means the initial purchase is the only one, while a higher number indicates multiple DCA entries.

If there isn't a pending signal for the given trading pair, the function returns null. 

It cleverly figures out whether you're running a backtest or a live trade automatically.

You just need to provide the symbol of the trading pair you’re interested in.

## Function getPositionInvestedCost

This function helps you figure out how much you've invested in a particular trading pair, like BTC-USDT. It calculates the total cost based on all the buy orders that have been committed, considering the cost associated with each order. 

If there isn’t a current trade happening, the function will return null. 

It cleverly knows whether it’s running a backtest or a live trade without you needing to tell it. You just give it the symbol of the trading pair you’re interested in.

## Function getPositionHighestProfitTimestamp

This function helps you find out exactly when a specific trade, or "position," made the most profit during its lifetime. 

It looks at a particular trading pair, like 'BTCUSDT', and tells you the timestamp – essentially a date and time – when the price reached its most profitable point for that trade.

If there's no active trading signal associated with that symbol, it will return null.


## Function getPositionHighestProfitPrice

This function helps you find the highest price a trade has reached while being profitable. 

Think of it as tracking the best moment a long trade climbed above your entry price, or the lowest point a short trade dropped below your entry price.

It’s updated as the market moves, constantly checking if a new high (for long positions) or low (for short positions) is achieved.

The function requires the trading symbol as input, and it will always return a number representing that peak profit price, even when the trade was initially opened. You won't get a null value while the trade is active.

## Function getPositionHighestProfitMinutes

This function tells you how long ago a trading position reached its highest profit point. It essentially tracks how far the position has fallen from that peak.

Think of it as a measure of how much "drawdown" the position has experienced since its best moment.

The result is in minutes, and it will be zero at the very instant the highest profit was achieved.

If there's no active trading signal for the specified symbol, the function will return null.

You just provide the symbol, like "BTCUSDT," and it gives you the time difference.

## Function getPositionHighestProfitDistancePnlPercentage

This function helps you understand how far your trading position is from its best-ever profit point. It calculates the difference between the highest profit percentage achieved and the current profit percentage, but only considers positive differences (so it won't show a loss). If no trading signals have been registered yet, it won’t be able to calculate this, and will return nothing. You provide the trading symbol, like "BTCUSDT," and it will give you that distance as a percentage.

## Function getPositionHighestProfitDistancePnlCost

This function helps you understand how far your trading position is from its most profitable point. It calculates the difference between the highest profit achieved so far and the current profit, but only considers positive differences (meaning it ignores any losses). 

Think of it as a way to measure how much room for error you have before potentially losing money. If no trading signals are currently pending, the function won’t be able to provide a value.

You provide the trading symbol (like "BTC-USD") as input, and it returns a number representing that distance in PnL cost.

## Function getPositionHighestProfitBreakeven

This function checks if a trade position could have reached a breakeven point at its most profitable price. 

Essentially, it helps determine if a trade had the potential to become profitable before needing to be closed.

It takes the trading pair symbol (like "BTCUSDT") as input.

If no trading signals are currently active, the function will return null.


## Function getPositionHighestPnlPercentage

This function helps you understand how well a particular trade performed. It looks at a specific trading pair, like BTC/USD, and tells you the highest percentage profit it ever reached while the trade was open. Think of it as finding the peak of the profit curve for that trade. If there’s no active trading signal for that symbol, the function will let you know by returning null. Essentially, it gives you a snapshot of the best possible profit achieved during a position's lifespan.

## Function getPositionHighestPnlCost

This function helps you understand the financial impact of a specific trade. It finds the highest profit price achieved during a position’s history for a given trading pair. Think of it as revealing the biggest potential gain that was available at any point while holding that trade. 

If there's no signal associated with that trade, the function will let you know by returning null.

To use it, you simply need to provide the trading pair's symbol.

## Function getPositionHighestMaxDrawdownPnlPercentage

This function helps you understand how risky a specific trading position has been. It calculates the maximum percentage loss (drawdown) a position has experienced, measuring the difference between its peak profit and its lowest point. Essentially, it tells you how far your profits have fallen from their highest value for that particular trading symbol. If there's no active trading signal for that symbol, the function won't be able to provide a value.

You'll need to provide the trading symbol, like "BTCUSDT", to get the drawdown percentage for that specific asset.


## Function getPositionHighestMaxDrawdownPnlCost

This function helps you understand the potential risk in your trading position. It calculates the difference between your current profit and loss and the lowest point your profit reached during a drawdown. Essentially, it tells you how far your profit could potentially fall before reaching that low point. If no trading signal exists for a particular symbol, the function will not return a value. You provide the symbol of the trading pair (like BTC/USDT) to get this information.

## Function getPositionEstimateMinutes

This function helps you understand how long a trade is expected to last. It tells you the originally estimated duration in minutes for a trade that's currently waiting to be executed. 

Think of it as checking the expected lifespan of a pending trade – it reveals the timeframe initially set when the signal was generated.

If there isn't a trade waiting, the function will let you know by returning null. You need to provide the symbol of the trading pair (like BTC-USDT) to use this function.

## Function getPositionEntryOverlap

This function helps you avoid accidentally making duplicate DCA entries when the price is very close to a previously established level. It checks if the current price falls within a small range around your existing DCA entry levels.

Essentially, it's a safeguard to ensure you’re not triggering a new DCA order when the price hasn’t moved significantly.

The function returns true if the current price is within the acceptable range and false if no such levels exist.

You provide the trading symbol and the current price to be evaluated. There’s also an optional configuration to adjust the size of the tolerance zone around the entry levels.

## Function getPositionEntries

getPositionEntries lets you see the details of how a trade was built up, especially if you've used DCA (dollar-cost averaging). It gives you a list of each time the position was increased, showing the price at which it was bought and how much money was spent on that particular purchase. If no trade is in progress, it won't return anything. If the trade was a single purchase and didn’t involve any DCA, you'll get a list with only one entry. You need to provide the trading symbol (like BTC-USDT) to get the position entries for that specific pair.

## Function getPositionEffectivePrice

This function calculates the effective entry price for your current trading position, essentially your average cost per unit. It takes into account any dollar-cost averaging (DCA) entries you've made.

The calculation uses a harmonic mean, which gives more weight to earlier, potentially lower-priced, entries.

If you've closed parts of your position along the way, the function considers those partial closures to determine the weighted average. If you haven’t used DCA, the result will be the original entry price.

The function will return `null` if no active trade signal is present. It automatically adjusts its behavior based on whether it's running in a backtest or live trading environment.

You only need to provide the symbol of the trading pair (like BTCUSDT) to get this effective price.

## Function getPositionDrawdownMinutes

getPositionDrawdownMinutes tells you how much time has passed since your current trade reached its highest profit point. 

Think of it as a measure of how far your trade has fallen from its best moment.

The value starts at zero when a trade first becomes profitable, and increases as the price moves away from that peak.

If there isn't an active trade happening, it won't be able to give you a number.

You provide the symbol, like "BTCUSDT," to specify which trade you're checking.

## Function getPositionCountdownMinutes

This function helps you understand how much time is left before a trading position expires. It calculates the time difference since a pending signal was created and compares it to an estimated expiration time. 

The result is the number of minutes remaining, but it will never be a negative number – if the estimated time has passed, the function returns zero. 

If there isn't a pending signal associated with the symbol, the function will return null to indicate that information isn't available. To use it, you simply provide the symbol of the trading pair you're interested in.

## Function getPositionActiveMinutes

getPositionActiveMinutes helps you understand how long a particular trade has been running. It tells you the number of minutes a position has been open, giving you insight into its duration. 

If there's no signal pending for that trade, it won't be able to provide a number. 

You just need to tell it which trading pair (like BTC-USD) you're interested in to get the active minutes.

## Function getPendingSignal

This function lets you check if your trading strategy has a pending order waiting to be filled. It gives you details about that pending signal, like the price and quantity.

If there's no pending order currently waiting, it will tell you by returning nothing.

It automatically figures out whether it's running a test or a live trading scenario, so you don't have to worry about setting that yourself.

You just need to provide the trading pair symbol, like "BTCUSDT", to see the pending signal information.


## Function getOrderBook

This function allows you to retrieve the order book for a specific trading pair from the connected exchange. 

It essentially asks the exchange for the order book data. 

You'll need to provide the symbol, like "BTCUSDT", to specify which pair you want. You can also optionally specify how many levels of depth you want to see in the order book; if you don't specify, a default maximum depth is used. The timing of this request is handled automatically based on the current environment, whether you're in a backtesting scenario or live trading.


## Function getNextCandles

This function helps you grab a batch of historical candlestick data from an exchange. 

You give it the symbol (like BTCUSDT), the timeframe you want (like 1 minute, 5 minutes, or 4 hours), and how many candles you need.

It automatically fetches candles *after* the current time being used by the backtest, leveraging the specific way each exchange retrieves future data. 

Essentially, it's a straightforward way to get the next set of candles for analysis or testing.


## Function getMode

This function simply tells you whether the backtest-kit is currently running in backtest or live mode. It returns a promise that resolves to either "backtest" or "live", letting you know if you're testing historical data or actively trading. This is useful for adjusting your logic based on the environment.

## Function getMinutesSinceLatestSignalCreated

This function helps you figure out how much time has passed since the last trading signal was generated for a specific trading pair. It’s like a timer that starts when a signal comes in, and it tells you the elapsed minutes. 

It doesn't matter if the previous signal is still active or has already closed; it simply counts the minutes from that point forward. This is handy for things like pausing your trading strategy for a certain period after a stop-loss event.

If no signals exist for the given symbol, it will return null. The function smartly determines whether it's operating in backtest or live mode, so you don't need to worry about that. You just need to provide the trading pair symbol, like "BTCUSDT".

## Function getMaxDrawdownDistancePnlPercentage

This function helps you understand how risky a trading strategy has been by calculating the largest percentage drop from its highest point to its lowest point in terms of profit and loss. It measures the "drawdown," essentially the maximum loss from a peak to a trough.

To use it, you just provide the trading symbol (like 'BTC-USDT'), and it will return a number representing this drawdown percentage.

If there's no trading signal available for the given symbol, the function will return null, indicating that it can't calculate the drawdown.


## Function getMaxDrawdownDistancePnlCost

This function helps you understand the risk profile of a trading strategy. It calculates the maximum difference between the highest profit and the lowest loss experienced during a backtest. 

Think of it as measuring how far your profits could have fallen from their peak.

It considers the PnL cost, which means it takes into account transaction costs. 

The result is a numerical value representing this distance, and it will be zero or positive. The function requires the symbol of the trading pair you're analyzing.

## Function getLatestSignal

This function helps you retrieve the most recent trading signal for a specific asset, like BTC/USDT. 

It doesn't care whether the signal led to an open or closed trade; it just gives you the latest one recorded. This is handy for things like preventing trades too soon after a stop-loss – you could check the timestamp of the last signal to ensure enough time has passed.

The function looks for this signal in your past backtest data first, and then in your live trading data if it's not found there. If no signal exists for that asset, it will return nothing. It automatically knows whether it's running a backtest or a live trading session.

You provide the trading pair symbol (e.g., "BTC/USDT") as input.


## Function getFrameSchema

The `getFrameSchema` function lets you look up the details of a specific frame used in your backtest. Think of it as retrieving the blueprint for how that frame is structured and what data it holds. You provide the name of the frame you’re interested in, and the function returns information about its schema, defining things like the data types and available fields. This is useful for understanding the exact format of the data being processed within your backtest.

## Function getExchangeSchema

This function lets you get details about a specific cryptocurrency exchange that backtest-kit knows about. It's like looking up the blueprint for how that exchange works within the framework. You provide the exchange's name, and it returns a structured description of that exchange – things like its data format, how trades are handled, and other technical specifics. This information is crucial for setting up and running backtests that accurately simulate trading on that exchange.

## Function getDefaultConfig

This function provides you with a starting point for configuring your backtests. It returns a set of pre-defined values for various settings, like how often to check prices, limits on signal generation, and maximum numbers of rows for displaying results. Think of it as a template – you can use these defaults as they are, or modify them to fine-tune your backtest’s behavior. It's a great way to discover all the available configuration options and understand what they do.

## Function getDefaultColumns

This function gives you the standard set of columns used for generating reports within the backtest-kit framework. It’s essentially a blueprint showing you the pre-defined columns for things like trade results, heatmap data, live events, and performance metrics. Think of it as a peek at what's available to customize your reports – you can use it as a starting point to understand and adjust the columns you want to display. It provides a read-only object containing definitions for various column types, offering a clear view of the options you have.


## Function getDate

This function, `getDate`, simply retrieves the current date. 

It behaves differently depending on whether you're running a simulation (backtest) or live trading.

During a backtest, it provides the date associated with the timeframe being analyzed. When running live, it returns the actual, current date.

## Function getContext

This function gives you access to the current method's environment. Think of it as a way to peek under the hood and see what's happening during a particular step in your backtest. It provides a snapshot of data and configurations relevant to the current process. You'll get a special object containing details about how the method is running, like the current time or any custom variables set up.

## Function getConfig

This function lets you peek at the framework's configuration settings. 

Think of it as a way to see what's currently set up behind the scenes. 

It provides a snapshot of all the configuration values, like candle fetching limits, maximum row counts for reports, and various experimental feature toggles. The values returned are a copy, so you can look at them without worrying about changing anything.

## Function getColumns

This function provides access to the column definitions used for creating markdown reports within the backtest-kit framework. It essentially gives you a snapshot of how the data will be organized and displayed in your reports. The returned configuration includes columns for various data types like strategy results, risk metrics, schedule events, and more. This way, you can understand and potentially adapt the reporting structure without directly altering the system's configuration.

## Function getCandles

This function helps you retrieve historical price data, also known as candles, for a specific trading pair. You tell it which symbol you're interested in, like "BTCUSDT" for Bitcoin against USDT, and the timeframe you want – options include intervals from 1 minute to 8 hours. It fetches a set number of candles, specified by the `limit` parameter, going back from the current time. Essentially, it's your gateway to getting the price history you need for analysis and backtesting.


## Function getBreakeven

This function helps determine if a trade has become profitable enough to cover associated costs. It looks at the current price of an asset and compares it to a calculated threshold, designed to account for slippage and trading fees. Essentially, it tells you if your trade has moved into a zone where you've recouped the costs of entering the position. The function handles whether you're in a backtesting environment or a live trading situation automatically. To use it, you’ll provide the symbol of the asset you're trading and the current price.


## Function getBacktestTimeframe

This function helps you find out the dates and times available for backtesting a specific trading pair, like BTCUSDT. It returns a list of dates representing the timeframe for which historical data is accessible. You simply provide the trading pair's symbol, and it gives you back the timeline you can use for your backtesting simulations.

## Function getAveragePrice

This function, `getAveragePrice`, helps you determine the VWAP (Volume Weighted Average Price) for a specific trading symbol like BTCUSDT. It looks at the most recent five one-minute price candles to figure out this average. 

Essentially, it’s calculating a weighted average that considers both price and trading volume. If there's no volume data available, it falls back to simply averaging the closing prices instead. You just need to provide the symbol you're interested in to get the result.

## Function getAggregatedTrades

This function retrieves a list of aggregated trades for a specific trading pair, like BTCUSDT. It pulls this data from the exchange that's been set up within the backtest-kit framework.

By default, it aims to retrieve trades within a defined time window. You can also specify a `limit` to only get the most recent 'n' number of trades. This is useful if you only need a portion of the available trade history.


## Function getActionSchema

This function lets you look up the details of a specific action within your trading strategy. Think of it as finding the blueprint for how a particular action, like placing an order or calculating an indicator, should be executed. You provide the name of the action, and it returns a structured description outlining what that action involves. It's a way to understand exactly how each component of your strategy is designed.

## Function formatQuantity

This function helps you display the correct quantity of an asset for trading. It takes the trading pair, like "BTCUSDT", and the raw quantity number, and then formats it to match the specific rules of the exchange you're using. This ensures the quantity is shown with the correct number of decimal places as required by the exchange. Essentially, it takes care of the formatting details for you, so you don't have to worry about getting them right.

## Function formatPrice

This function helps you display prices correctly for different trading pairs. It takes a symbol like "BTCUSDT" and a price value, and then formats the price according to the specific rules of that exchange. This ensures the displayed price has the correct number of decimal places, making it look and feel right for each market. Essentially, it handles the details of how to format prices so you don't have to.


## Function dumpText

The `dumpText` function allows you to save raw text data associated with a specific signal. It’s handy for recording information like trade notes or analysis directly linked to a particular trading signal. 

Essentially, it takes a chunk of text, a unique ID for that data, and a description and then stores it. 

It automatically figures out which signal it's linked to, but if it can’t find a signal to attach it to, it’ll just let you know and won't save anything. You need to provide the bucket name, dump ID, the text content, and a description.


## Function dumpTable

This function helps you display data in a structured table format. It's particularly useful when dealing with results from backtesting or simulations.

It automatically figures out the table headers by looking at all the keys used in the data you provide.

The function is designed to connect to a specific signal, which means it’s built to work within the context of a trading strategy or analysis. If a signal isn't found, it'll let you know with a warning.

You'll pass in an object containing the table data, a bucket name, a unique identifier for the dump, a description, and the actual rows of data as an array of objects. It then neatly formats and displays that information.


## Function dumpRecord

The `dumpRecord` function lets you save a piece of data, like a transaction or observation, associated with a specific trading signal. Think of it as writing down a snapshot of what happened during a trade. 

It automatically figures out which signal the data belongs to, so you don't have to specify it directly. 

If there isn't a signal currently being processed, the function will simply skip the dump and let you know it didn’t do anything. You provide all the details – the signal's name, a unique identifier for the dump, the data itself, and a short explanation. This helps keep your backtesting results organized and understandable.


## Function dumpJson

The `dumpJson` function lets you write out complex data structures as nicely formatted JSON within your backtesting process. It's particularly helpful for examining the state of your trading system at a specific point in time. This function automatically grabs information from the current signal, so you don't need to manually provide the signal identifier. If there isn't a signal available, it will let you know with a warning and won't proceed. You provide the bucket name, a unique identifier for the dump, the JSON data itself (which can be deeply nested), and a short description to clarify what the JSON represents.

## Function dumpError

This function is designed to help you record and track errors that occur during your backtesting process. It takes detailed information about the error – including a bucket name, a unique dump ID, the error message itself, and a more descriptive explanation – and sends it somewhere for later analysis. 

Essentially, it’s a way to capture error information tied to a specific trading signal, making it easier to debug and understand why a backtest might have gone wrong. If no signal is currently active, it will just let you know with a warning that the information couldn’t be saved.


## Function dumpAgentAnswer

This function helps you save a complete record of an agent's conversation, connecting it to a specific trading signal. 

It automatically figures out which signal it’s related to by looking at the current context of the backtest. 

If no signal is found, it'll let you know with a warning. The saved data includes the signal ID, a description, and all the messages exchanged with the agent. This is great for detailed analysis and debugging.


## Function commitTrailingTakeCost

This function lets you set a specific, fixed price for your take-profit order. It’s helpful when you want to ensure your take-profit is always at a certain level, regardless of price fluctuations.

Behind the scenes, it figures out the best way to adjust your take-profit based on whether you're in a backtesting or live trading environment.

It also automatically gets the current market price to calculate the new take-profit level.

You provide the trading pair symbol and the exact price you want your take-profit to be set at, and the function handles the rest.


## Function commitTrailingTake

This function lets you fine-tune the trailing take-profit level for an existing order. It’s designed to adjust the take-profit distance based on a percentage change relative to the original take-profit level you set initially.

Think of it as making small, incremental adjustments to your profit target. It's important to remember that this calculation always refers to the original take-profit distance, preventing errors from accumulating over time.

The function follows a rule: it only updates the take-profit if the new value is more conservative—meaning closer to the entry price. For long positions, it only allows you to lower the take-profit, and for short positions, it only allows you to raise it.

You provide the trading symbol, the percentage adjustment you want to apply, and the current market price. The function handles whether it's running in backtest or live mode automatically.

## Function commitTrailingStopCost

This function lets you update the trailing stop-loss order to a specific price. 

It simplifies setting a stop-loss by automatically calculating the percentage shift needed based on the initial stop-loss distance. 

The function handles whether you’re in a backtest or live trading environment and fetches the current price to ensure the adjustment is accurate. You just need to provide the trading symbol and the desired stop-loss price.


## Function commitTrailingStop

The `commitTrailingStop` function lets you fine-tune the distance of a trailing stop-loss order. It’s designed to work with existing pending signals, automatically adjusting the stop-loss level based on a percentage shift you provide.

It's really important to understand that this function calculates changes relative to the *original* stop-loss distance set when the trade was initially opened. This prevents small errors from adding up over time.

The function prioritizes protection; if you suggest a new stop-loss distance, it will only be applied if it offers better protection (more profit preservation) than the current one.

For long positions, the stop-loss will only move further away from the entry price, and for short positions, it will only move closer.

Finally, the function knows whether it's running in a backtesting environment or live trading mode based on where it's executed. You pass in the symbol, the percentage shift you want, and the current market price.

## Function commitSignalNotify

This function lets you send out informational messages about your trading strategy. Think of it as a way to leave notes about what's happening – maybe you want to record when a specific indicator triggers, or just generally track decisions your strategy is making. It doesn't actually change your positions; it's purely for communication.

It automatically figures out whether you're in backtest or live mode, and it knows the name of your strategy and the exchange you're using. It also grabs the current price for you.

You provide the trading pair symbol, like "BTCUSDT", and can add extra details with the optional 'payload' argument to make your notifications more specific.

## Function commitPartialProfitCost

The `commitPartialProfitCost` function lets you automatically close a portion of your trading position when you've made a certain profit in dollar terms. It's a handy shortcut because it figures out the percentage of your position you need to close based on the dollar amount you specify.

Essentially, it's like saying, "Close enough of this trade to take $150 in profit."

This function works whether you're backtesting or trading live and handles getting the current market price for you.

You provide the trading symbol (like "BTCUSDT") and the dollar amount you want to profit. For instance, passing `150` will close enough of the position to realize $150 in profit.


## Function commitPartialProfit

This function lets you automatically close a portion of an open trade when the price is moving in a profitable direction, essentially a way to secure some gains as you go. You specify the trading symbol and the percentage of the trade you want to close, like closing 25% or 50% of the position. It handles whether you're running a backtest or a live trading session, so you don’t have to worry about configuring that separately. It's useful for managing risk and ensuring you lock in profits along the way.


## Function commitPartialLossCost

This function helps you partially close a trading position when it's experiencing a loss, by specifying the exact dollar amount you want to close. It simplifies the process by calculating the percentage of your position based on the dollar amount you provide.  Essentially, it's a shortcut for closing a portion of your position to limit losses, and it automatically adjusts for whether you're in a backtesting or live trading environment. The function handles retrieving the current price for you, making the process even easier. You provide the symbol of the trading pair and the dollar amount you want to close, and the function takes care of the rest, ensuring the price is moving in the direction of your stop loss.

## Function commitPartialLoss

This function allows you to close a portion of your open trade when the price is moving against you, essentially working towards your stop-loss level. You specify the symbol of the trading pair and the percentage of the position you want to close. It's designed to automatically adjust based on whether you’re running a backtest or a live trade. Think of it as a way to reduce risk by partially exiting a trade that's trending unfavorably.


## Function commitClosePending

This function lets you cancel a pending trade signal without interrupting your strategy's operation. Think of it as removing a temporary order that was placed but hasn't been executed yet. It's useful when you want to adjust your plans but don't want to completely pause or reset the trading strategy. The function is smart enough to understand whether it's running in a backtesting environment or a live trading scenario. 

You can optionally include extra information like an ID or a note to document why you're canceling the pending order. This is particularly helpful for tracking decisions during backtesting or live trading.


## Function commitCancelScheduled

This function lets you cancel a scheduled signal within your trading strategy, but it won't interrupt the strategy's normal operation. Think of it as putting a hold on a future action – the strategy will keep running and generating signals. It specifically removes the signal that’s waiting to be triggered by the next priceOpen, but any existing signals or ongoing strategy processes are unaffected. Importantly, canceling a scheduled signal doesn't halt the overall strategy; it can still produce new signals and continue its execution. The system knows whether it's running a backtest or a live trade automatically.

You can optionally add a payload to your cancellation, such as an ID or a note, to help you keep track of why you canceled the signal.

## Function commitBreakeven

This function helps you manage your risk by automatically adjusting your stop-loss order. It moves your stop-loss to the entry price – essentially eliminating the risk of a losing trade – once the price has moved favorably enough to cover your transaction costs and a small buffer. Think of it as a way to lock in profits once a trade has moved in your favor. The function handles the details of checking if it's a backtest or live environment and automatically retrieves the current price to determine if the threshold has been reached. You just need to specify the trading symbol you want to apply this to.

## Function commitAverageBuy

The `commitAverageBuy` function helps you automatically add new buy orders to your trading strategy, specifically when using a dollar-cost averaging (DCA) approach. It essentially records a purchase at the current market price and keeps track of the average price you've paid for the asset so far. This function simplifies the process of building a trading history for your strategy and notifies the system that a buy order has been placed. It handles details like determining whether you're in a backtesting or live trading environment and retrieving the current price, so you can focus on the overall trading logic. You provide the symbol of the trading pair, and optionally the cost, to complete the buy action.

## Function commitActivateScheduled

This function lets you manually trigger a previously scheduled signal, even before the price reaches the expected open price. Think of it as an early activation.

It sets a flag on the signal, and the strategy will then apply the signal during the next tick.

It intelligently determines whether you're running a backtest or a live trading session.

You'll need to provide the symbol of the trading pair you're dealing with. 

Optionally, you can include a payload to add extra information like an ID or a note to the activation.


## Function checkCandles

The `checkCandles` function is a tool to ensure your historical candle data is properly aligned with the trading intervals you've defined. It’s essentially a health check for your data, verifying that the timestamps match up as expected. This function dives deep, reading the raw data files directly from the persistent storage – it doesn’t rely on any intermediary layers. If you suspect there might be issues with the timing or consistency of your candles, running `checkCandles` can help identify and correct those problems. You'll provide it with validation parameters to guide its checks.

## Function addWalkerSchema

This function lets you define a new "walker," which is essentially a way to run several trading strategies against the same historical data and then directly compare how well they performed. Think of it as setting up a contest between different strategies to see who comes out on top. You provide a configuration object that describes how this walker should operate, including how to run the strategies and what metrics to use for comparison. This is useful for understanding which strategies work best in specific market conditions.

## Function addStrategySchema

This function lets you tell backtest-kit about a new trading strategy you've built. It’s how you register a strategy so the framework knows what it is and how to use it.

When you register a strategy this way, the framework will automatically check to make sure it's set up correctly. It looks at things like the prices your strategy uses, the logic for take profit and stop loss orders, and when those orders are supposed to happen. 

The system also helps prevent your strategy from sending too many signals at once, which can be a problem. Finally, if you're running the backtest live, it's designed to make sure your strategy’s data is saved securely even if there are unexpected issues.

To register your strategy, you pass in an object that describes the strategy's settings.

## Function addSizingSchema

This function lets you tell the backtest-kit how to determine the size of your trades. It's how you define your risk management strategy. 

You provide a sizing schema, which outlines things like whether you'll use a fixed percentage of your capital for each trade, a Kelly Criterion approach, or something based on ATR. 

It includes details about risk tolerance, how much of your capital you're willing to risk, and constraints on how large a position can be. You can even include custom logic using a callback function to refine the sizing calculation.

## Function addRiskSchema

This function lets you set up how your trading strategies manage risk. Think of it as defining the guardrails for your entire trading system. 

You can tell the framework the maximum number of positions you want to hold at once, and also add your own custom checks to make sure your portfolio is healthy – for example, you might want to limit correlated trades. 

If a trading signal is blocked due to risk constraints, you can even define what happens next. Importantly, this risk setup is shared among all your strategies, so you have a holistic view of risk across your entire trading operation.

## Function addFrameSchema

This function lets you tell the backtest-kit about a new timeframe generator you want to use. Think of it as registering a way to create the periods of time your backtest will analyze—like daily, weekly, or monthly data. 

You provide a configuration object that specifies when the backtest starts and ends, the interval for creating those timeframes (e.g., every day), and a function that will be called when timeframe events occur. Essentially, it's how you customize the time slices your backtest operates on.

## Function addExchangeSchema

This function lets you integrate a new exchange into the backtest-kit system. Think of it as telling the system where to get historical price data and how to interpret it. You'll provide a configuration object, which defines things like how to fetch candles, how to format prices and quantities, and how to calculate things like VWAP. Essentially, it's how you connect the system to real-world exchange data.

## Function addActionSchema

This function lets you register a custom action handler within the backtest-kit framework. Think of actions as a way to react to events happening during your backtest, like a trade being opened or closed.

You can use these actions to do things like update your state management library, send notifications to a chat service, log important events, track metrics, or trigger other custom logic.

Each action is linked to a specific strategy and timeframe, and receives all the relevant data generated during the backtest – signals, profits, losses, and more. To use it, you provide an object describing how the action should behave.
