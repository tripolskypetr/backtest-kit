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

The `writeMemory` function lets you store data that your trading strategies can access later, like remembering a specific price level or a calculated indicator value. Think of it as creating labeled containers for information within your backtest or live trading environment. It automatically identifies whether you’re running a simulation (backtest) or a live trade. 

The function requires a few key pieces of information: the name of the storage bucket, a unique ID to identify the memory location, the actual data you want to store, and a brief description of what that data represents. It uses the signal ID to associate the stored data with a specific trading signal, ensuring context and relevance. If no signal is active, it won't store the value and will let you know with a warning.

## Function warmCandles

This function helps prepare your backtesting environment by pre-loading historical price data, also known as candles. It downloads candles for a specific time period, from a start date to an end date, using a particular timeframe (like 1-minute, 1-hour, or daily). This process essentially caches the data, making your backtests run much faster because they don't have to fetch the data every time. You provide the start and end dates, and the desired timeframe, and the function handles the rest of the data retrieval and storage.

## Function validate

This function helps you make sure everything is set up correctly before you run your backtests or optimizations. It checks if all the entities you're using – like exchanges, trading strategies, and risk management rules – are properly registered within the system.

You can tell it to check specific entities, or if you leave it alone, it will check *everything* to give you a complete overview of your setup. This makes sure you don’t run into errors later because something is missing or misconfigured. 

The results of these checks are stored so the process is faster if you need to re-validate. It's a good habit to use this function as part of your workflow to ensure accurate and reliable backtesting results.

## Function stopStrategy

This function lets you pause a trading strategy's signal generation. It’s useful if you need to temporarily halt trading activity.

It prevents the strategy from creating new trade signals, but any existing, ongoing signals will finish their lifecycle. 

The system gracefully stops the strategy, either when it's idle or after the current signal has closed, adapting to whether you're in backtest or live trading mode.

You simply provide the symbol (like "BTCUSDT") of the trading pair to stop the strategy for.

## Function shutdown

This function provides a way to properly end a backtest. It signals to all parts of the backtest system that it's time to wrap things up and do any necessary cleanup, like saving data or closing connections. Think of it as a polite way to say goodbye before the program stops running, ensuring nothing is left unfinished. This is useful when you need to stop the backtest process, for example, when you press Ctrl+C.

## Function setLogger

You can now control how backtest-kit reports its activities. The `setLogger` function lets you provide your own logging system.

This means all the messages the framework generates – like what it’s doing and which assets it's working with – will be sent to your logger. It even automatically adds helpful details to these messages, like the strategy name, the exchange being used, and the symbol being traded, so you get a complete picture of what’s happening. Just provide an object that implements the `ILogger` interface.


## Function setConfig

This function lets you adjust the overall settings for the backtest-kit framework. You can use it to change things like the default data source or other global preferences.  The `config` argument lets you specify only the settings you want to change; you don't need to provide a complete configuration.  There's also a special `_unsafe` flag, which is primarily used in test environments to bypass some of the configuration checks.

## Function setColumns

This function lets you customize the columns displayed in your backtest reports, like the ones generated in markdown format. You can change how specific data points are presented, essentially tailoring the report's appearance. It's designed to let you override the standard column settings for any report type.  The function checks to make sure your custom column configurations are structured correctly, but if you're working in a testing environment and need to bypass those checks, there's a special flag to do so.

## Function searchMemory

The `searchMemory` function helps you find relevant memory entries based on a text search. It's designed to quickly locate information related to a specific signal.

It automatically identifies which environment you're working in - whether it's a backtest or a live trading session.

The function takes a simple object that tells it which memory bucket to search and the search term you’re looking for.

It uses a technique called BM25 to rank the memory entries by how well they match your search, so you'll get the most relevant results first.

If there’s no active signal to search against, it will let you know with a warning message but still proceed by returning an empty list of results.


## Function runInMockContext

The `runInMockContext` function lets you execute pieces of code as if they were running within a backtest-kit environment, but without actually needing a full backtest setup. This is really handy for testing or creating scripts that rely on things like getting the current timeframe or other context-aware data.

You can customize the context by providing details like the exchange name, strategy name, frame, symbol, and whether it's a backtest or live mode. If you don't specify these, it defaults to a simple live-mode setup with placeholder names and the current minute boundary. 

Essentially, it gives you a controlled environment to run code that expects to be part of a backtest-kit system, making it easier to isolate and test specific parts of your code.

## Function removeMemory

This function lets you delete a specific memory record associated with a signal. 

It automatically figures out whether you're in backtesting or live trading mode.

To use it, you’ll need to provide the bucket name and the unique ID of the memory you want to get rid of.

If there isn't an active signal to link the removal to, it will log a warning but won’t actually delete anything.


## Function readMemory

This function lets you retrieve data stored in memory, specifically data linked to a particular signal. Think of it as accessing a piece of information saved during a trading simulation or live trade. 

It figures out whether you’re running a backtest or a live trading session by looking at the execution context. 

The function needs two pieces of information: the name of the memory bucket where the data is stored and a unique identifier for the specific memory item you're trying to find. If there's no active signal to associate the memory with, it will alert you with a warning message and return nothing. The data retrieved will be of a type you specify when you call the function.


## Function overrideWalkerSchema

This function lets you tweak existing walker configurations, which are used when comparing different strategies. Think of it as a way to make small adjustments to a setup without completely rebuilding it. You provide a partial configuration – just the parts you want to change – and the function merges those changes with the original configuration, leaving everything else untouched. It returns the updated, complete walker configuration.

## Function overrideStrategySchema

This function lets you tweak a strategy's configuration after it's already been set up. Think of it as a way to make small adjustments without having to redefine the entire strategy from scratch. You provide a partial configuration – just the parts you want to change – and the function will update the existing strategy, leaving everything else untouched. It’s useful for making iterative improvements or applying minor adjustments to your trading strategies.


## Function overrideSizingSchema

This function lets you tweak an already existing position sizing setup. Think of it as a way to make small adjustments—you provide just the parts you want to change, and everything else stays the same. It’s useful when you need to fine-tune how much capital is allocated for trades without rebuilding the entire sizing strategy. You give it a partial sizing configuration, and it returns a modified sizing configuration.

## Function overrideRiskSchema

This function lets you tweak existing risk management settings within the backtest-kit system. Think of it as a way to make small adjustments to a larger risk configuration without having to rebuild it from scratch.  You provide a partial configuration – only the settings you want to change – and the framework updates the existing risk management setup accordingly, leaving everything else untouched. It's handy for fine-tuning your risk controls based on new insights or changing market conditions.


## Function overrideFrameSchema

This function lets you modify a timeframe's configuration used during backtesting. Think of it as tweaking a specific part of an existing timeframe setup—you're not creating a whole new timeframe, just adjusting certain elements. You provide a partial configuration, essentially saying "only change these parts of the existing timeframe," and the rest stays the same. This is helpful when you want to fine-tune a timeframe without redefining it entirely.

## Function overrideExchangeSchema

This function lets you modify an existing exchange's configuration within the backtest-kit. Think of it as making targeted updates – you specify what you want to change, and only those parts of the exchange’s settings are altered.

It's useful when you need to adjust an exchange's properties without replacing the entire definition.

You provide a partial configuration object, and the function updates the existing exchange schema.  Anything you don't include in the provided object remains as it was originally defined.

## Function overrideActionSchema

This function lets you tweak an existing action handler without needing to completely replace it. Think of it like making small adjustments to how your trading actions are handled.

You can use this to change how events are processed, modify the callbacks used in different environments like development versus production, or even swap out different action implementations on the fly. It’s especially handy if you want to adjust the behavior of your actions without altering the core strategy itself.

It works by allowing you to provide only the parts of the action configuration you want to change; the rest of the configuration remains untouched.

## Function listenWalkerProgress

This function allows you to monitor the progress of a backtest simulation as it runs. It lets you subscribe to events that are triggered after each trading strategy finishes within the backtest. Importantly, the events are delivered and processed one at a time, even if your monitoring function takes some time to execute – this helps prevent issues that can arise from running multiple things at once. You provide a function that will be called with information about the progress of the backtest, and it returns a function to unsubscribe from these updates.

## Function listenWalkerOnce

`listenWalkerOnce` lets you watch for specific changes happening within a trading strategy's process, but only once. You provide a filter that defines what kind of changes you're interested in, and a function that will run when a matching change occurs. Once that function has executed, the listener automatically stops, making it great for scenarios where you need to react to something just one time. It's like setting a temporary alarm for a particular event.

It takes two arguments: a filter function to select which events you want to see, and a callback function to be executed when a matching event occurs. The function returns an unsubscribe function that you can call to manually stop the listener if needed.

## Function listenWalkerComplete

This function lets you listen for when the entire backtesting process finishes, including all the strategies you’ve set up. Think of it as a notification that the testing is truly done.  The events are handled one at a time, even if the function you provide takes some time to run, ensuring everything happens in the correct order. This helps to avoid issues caused by running callbacks simultaneously. To stop listening, simply call the function that's returned by `listenWalkerComplete`.

## Function listenWalker

The `listenWalker` function lets you keep tabs on how a backtest is progressing. It’s like setting up a listener that gets notified after each strategy finishes running within a backtest.

You provide a function that will be called whenever a strategy completes. The information passed to your function tells you about that particular strategy's run.

Importantly, the events are handled one at a time, even if your callback function takes some time to process the data, so you avoid potential problems with things happening simultaneously. This ensures a clean and orderly flow of information as your backtest runs.


## Function listenValidation

This function lets you keep an eye on any problems that pop up when the system is checking if your trading signals are okay. 

It's like setting up a listener that gets notified whenever a risk validation check throws an error. 

You provide a function (`fn`) that will be called whenever an error happens; this function receives the error object itself.

This is super helpful for debugging and monitoring - you'll know immediately if anything goes wrong during the validation process.  

Importantly, the errors are handled one at a time, even if the function you provide takes some time to run, to ensure a controlled and sequential process.


## Function listenSyncOnce

`listenSyncOnce` lets you temporarily hook into signal synchronization events, ensuring a specific action happens just once based on a condition you define. Think of it as a one-time alert for a particular signal. 

This is particularly helpful when you need to coordinate with external systems—it pauses the trading process until your action completes.  You provide a filter function to specify which signals you’re interested in and a callback function that will be executed once when a matching signal arrives. If your callback function involves asynchronous operations like promises, the trading system will wait for those operations to finish before continuing.


## Function listenSync

This function lets you listen for synchronization events related to trading signals, specifically when signals are pending—like when an order is about to be opened or closed. It's designed to help you coordinate with other systems, perhaps updating an external database or triggering another process. The key is that any trading actions will pause until your function finishes executing, so it's perfect for critical synchronization tasks. You provide a function that gets called when these events happen, and that function can even handle promises to ensure asynchronous operations are complete.


## Function listenStrategyCommitOnce

This function lets you react to specific events related to strategies, but only once. Think of it as setting up a temporary listener that does its job and then disappears. You define what kind of event you're interested in using a filter, and then provide a function that will run when that event occurs. After the function runs once, the listener automatically stops listening, so it's perfect for situations where you need to react to something happening just one time.


## Function listenStrategyCommit

This function lets you keep an eye on what's happening with your trading strategy's actions. It's like setting up a listener that will notify you whenever a strategy takes certain actions, such as canceling scheduled orders, closing positions, adjusting stop-loss or take-profit levels, or moving a stop-loss to break-even.

These events are handled one at a time, even if your reaction to them takes some time to process (like if it involves asynchronous operations).  This ensures that nothing gets missed or mixed up in the sequence.

You provide a function (the `fn` parameter) that gets called whenever one of these actions occurs, and this function will receive information about the specific event that triggered the notification.  The function you provide returns another function that you can call to stop listening.

## Function listenSignalOnce

This function lets you react to specific signals from your trading strategy just once. It's like setting up a temporary alert that fires only when a certain condition is met. You tell it what condition you're looking for – a filter – and what you want it to do when that condition appears. After that one action, it automatically stops listening, so you don't have to worry about managing the subscription yourself. It's perfect for situations where you need to perform an action based on a signal, but only need to do it once.

You provide a function that decides if a signal matches your criteria.
Then, you give it another function that describes what you want to happen when a matching signal is received.
The function handles the subscription and unsubscription for you.

## Function listenSignalLiveOnce

`listenSignalLiveOnce` lets you temporarily tap into the live trading signals generated by a backtest, but only for a single event that matches your specific criteria. Think of it as setting up a brief alert – it listens for signals, and when one comes along that fits your filter, it runs your callback function once and then automatically stops listening. You provide a function to define what kind of signal you’re looking for (the `filterFn`), and another function to execute when that signal arrives (the `fn`). This is useful for quickly verifying something or reacting to a particular trading opportunity without constantly monitoring the signals.


## Function listenSignalLive

The `listenSignalLive` function lets you hook into real-time trading signals generated during a live backtest run. It's a way to get notified as the backtest progresses and react to each signal.

Think of it as subscribing to a stream of events—each event represents a signal—and your provided function will be called whenever a new signal arrives.

The function takes one argument: a callback function. This callback receives the signal details (as an `IStrategyTickResult`) and performs whatever action you want it to. 

Importantly, this only works for signals created while a backtest is actively running with `Live.run()`. Events are handled one at a time, ensuring they're processed in the order they're received. The function returns an unsubscribe function so that you can stop listening to these events later.


## Function listenSignalBacktestOnce

The `listenSignalBacktestOnce` function lets you temporarily listen for specific events during a backtest run. Think of it as setting up a temporary listener that only reacts to events matching your criteria.

It's designed to be short-lived – the provided callback function will execute just once when a matching event occurs, then the listener automatically disappears.

You provide a filter to specify which events you're interested in, and a function to handle those events. It only works while the backtest is actively running.


## Function listenSignalBacktest

This function lets you tap into the flow of events during a backtest. 

It sets up a listener that will receive updates, one after another, as the backtest progresses. 

Think of it as a way to react to what's happening in the simulation as it unfolds.

You provide a function that will be called with each event. This function will receive information about what happened during that particular step of the backtest.

Importantly, this listener only works when you’re actively running a backtest using `Backtest.run()`.


## Function listenSignal

This function lets you tap into the flow of signals from your backtest, such as when a trade is opened, active, or closed. It's designed to be reliable, ensuring that events are handled one at a time, even if your callback function needs to do some asynchronous work. Essentially, you provide a function that will be called whenever a signal event occurs, and this function will return another function that you can call to unsubscribe from receiving those signals later.

## Function listenSchedulePingOnce

This function lets you react to specific ping events, but only once. You provide a filter to pinpoint the exact events you're interested in, and a function to execute when that event occurs. Once the event matches your filter, the function runs your callback and then stops listening, making it perfect for one-off tasks triggered by ping events. It simplifies the process of reacting to a condition and then cleaning up the listener automatically.

## Function listenSchedulePing

This function lets you listen for periodic "ping" signals related to scheduled trading signals. These pings happen every minute while a signal is waiting to become active, giving you a way to keep tabs on its progress. Think of it as a heartbeat to confirm the signal is still being monitored.

You provide a function that will be called each time a ping is received, allowing you to implement your own checks or logging. This is useful for monitoring the lifecycle of a scheduled signal and building custom monitoring systems. Essentially, you're subscribing to these signals to build custom actions that run periodically while waiting for a scheduled signal to activate. 

The function returns another function that you can call to unsubscribe from the ping events.


## Function listenRiskOnce

`listenRiskOnce` lets you react to specific risk rejection events, but only once. Think of it as setting up a temporary listener that automatically goes away after it hears what you're looking for. You tell it what kind of events you're interested in with a filter, and then provide a function that will run when that event happens. Once that event is triggered, the listener stops listening, ensuring it only reacts once. It's handy for situations where you need to react to a specific risk condition and then stop monitoring.


## Function listenRisk

This function lets you be notified whenever a trading signal is blocked because it violates your risk rules. 

Think of it as a listener that only rings when something goes wrong with your risk management.

It's designed to be reliable – events are processed one at a time, even if your response function takes some time. You won't receive notifications for signals that *do* pass your risk checks, which helps keep things clean and avoids unnecessary alerts.

To use it, you provide a function that will be called with information about the rejected signal. The function you provide will return a function that can unsubscribe from risk rejection events.

## Function listenPerformance

This function lets you monitor how your trading strategies perform in real-time. It’s like having a performance detective watching your code as it runs.

It sends updates about the timing of different operations within your strategy, which is incredibly helpful for spotting where your code might be slow or inefficient.

You provide a function to be notified of these events – when it gets called, you can analyze the performance data.  The system ensures these notifications are handled one at a time, even if your analysis function takes some time to complete, preventing conflicts. You can unsubscribe from these performance updates whenever you want by returning the function it provides.

## Function listenPartialProfitAvailableOnce

This function lets you set up a listener that triggers a specific action only once when a certain profit condition is met. You provide a filter to define exactly what conditions you're looking for, and a function to run when that condition is met. Once the condition is met and your function runs, the listener automatically stops, ensuring it only acts once. It’s a handy way to react to a particular profit milestone and then forget about it.


## Function listenPartialProfitAvailable

This function lets you track your trading progress as you reach certain profit milestones, like 10%, 20%, or 30% gains. It’s designed to make sure these updates happen one at a time, even if the process of handling them takes some time. 

You provide a function that gets called whenever a profit milestone is hit, and it will receive details about that event. 

Importantly, you can unsubscribe from these updates when you no longer need them – the function returns a way to do just that.


## Function listenPartialLossAvailableOnce

This function lets you set up a listener that reacts to specific changes in partial loss levels. It's designed to trigger a callback function just *once* when a particular condition is met – think of it as waiting for a specific signal and then acting on it. You provide a filter that defines the condition you're looking for, and a function that will execute when that condition is true. Once the function runs, the listener automatically stops, so you don't have to manage subscriptions yourself. It's helpful for situations where you need to react to a one-time occurrence of a certain loss level.


## Function listenPartialLossAvailable

The `listenPartialLossAvailable` function lets you track how much a trading strategy has lost during a backtest. It will notify you whenever the strategy hits specific loss milestones, like 10%, 20%, or 30% loss. 

Crucially, these notifications are handled in the order they occur, and the function ensures that your code processing these events runs one at a time, even if your callback function takes some time to complete. To use it, you provide a function that will be called with information about the partial loss event. The function returns another function that you can call to unsubscribe from these notifications.


## Function listenMaxDrawdownOnce

This function lets you set up a temporary alert for max drawdown events. You tell it what specific conditions you’re looking for using a filter, and then provide a function that should run *just once* when that condition is met. After that single execution, the alert automatically turns off. It's a handy way to react to a particular drawdown situation without needing to manage ongoing subscriptions.

You define the alert trigger with `filterFn`, which is a test to see if an event matches what you are looking for. 

The `fn` is the action that gets taken when that trigger condition is met.

## Function listenMaxDrawdown

This function lets you keep an eye on when your trading strategy hits new drawdown lows. It’s like setting up an alert that triggers whenever your strategy experiences a more significant loss than before.

The alerts will come to you one at a time, even if the function you provide to handle them takes some time to complete. This helps prevent problems that can arise when multiple alerts try to run at the same time.

You can use this to monitor your strategy's risk and adjust your approach accordingly – for example, scaling back trades when losses increase. To use it, simply provide a function that will be called whenever a new drawdown milestone is reached. The function will receive an object containing details about the drawdown event.


## Function listenHighestProfitOnce

This function lets you react to a specific highest profit event, but only once. You provide a rule (the `filterFn`) to identify the event you're interested in. When an event matches that rule, a callback function (`fn`) will be triggered to handle it.  After that one execution, the listener automatically stops, so you don’t have to worry about managing subscriptions yourself. It's great for situations where you need to respond to a particular profit condition just one time. 

The `filterFn` helps you narrow down which events are important.
The `fn` is where you put the logic to deal with that specific profit event.


## Function listenHighestProfit

This function lets you monitor when a trading strategy achieves a new peak profit. It's like setting up a notification system that alerts you whenever your strategy's profit reaches a new high.

The notifications are handled in a specific order, ensuring that even if your notification logic takes some time to process, everything runs smoothly and sequentially.

You provide a function to be executed whenever a new highest profit is achieved. This allows you to track profit milestones or adjust your strategy on the fly based on performance. The function you provide will be called with information about the event that triggered the notification.


## Function listenExit

This function lets you catch those really serious errors that can bring your backtest or live trading process to a complete halt. Think of it as an emergency alert system for your trading framework.

It listens for fatal errors that occur within background processes like Live.background, Backtest.background, and Walker.background. These aren't errors you can just recover from – they signal a more fundamental problem.

The errors are handled one at a time, in the order they happen, even if your error handling function takes a little bit of time to run. It ensures things are dealt with in a controlled manner. 

You provide a function (the `fn` parameter) that will be called whenever one of these critical errors occurs, allowing you to log the error, or take other actions.  When you're done needing to listen, you can unsubscribe from these events.


## Function listenError

The `listenError` function lets you set up a system for catching and dealing with unexpected problems that might happen while your trading strategy is running. Think of it as a safety net – if something goes wrong, like an API call failing, it won't crash the whole thing. 

It provides a way to handle these errors in a controlled way, allowing your strategy to keep running. The errors are processed one at a time, ensuring that any code you provide to handle them runs in a predictable order, even if that code itself takes some time to complete. This helps to maintain the stability and reliability of your automated trading system.


## Function listenDoneWalkerOnce

This function lets you react to when a background process within your backtest finishes, but only once. You provide a filter – a way to specify which completed processes you're interested in – and a callback function that will be executed when a matching process finishes. Once that callback runs, it automatically stops listening, so you don't need to worry about manually unsubscribing. It's a quick way to respond to a specific background task completion and then move on.


## Function listenDoneWalker

This function lets you keep track of when background processes within your trading strategies finish. Think of it as a way to be notified when a task is done, even if that task involves some asynchronous operations. The events are delivered one after another, ensuring a predictable order, and it handles these events in a way that prevents any unexpected issues from running multiple things at once. You provide a function that gets called when a background task is complete, and the function returns another function that you can use to unsubscribe from these notifications when you no longer need them.


## Function listenDoneLiveOnce

This function lets you react to when a background task finishes running within your backtest. It's designed for situations where you only need to know once when a specific background process completes.

You provide a filter—a way to specify which background tasks you're interested in—and a callback function that will run just one time when a matching task finishes. Once the callback executes, the listener automatically stops listening, preventing it from running again. This is helpful for cleaning up resources or performing actions immediately after a background task concludes without needing manual unsubscription.


## Function listenDoneLive

This function lets you be notified when background tasks started with `Live.background()` finish running. It's like setting up a listener that waits for these tasks to complete.

The events are delivered one after another, ensuring they're processed in the order they occur. 

Importantly, even if the function you provide to handle these events takes some time to execute (like an asynchronous operation), it won’t interfere with other events – everything is handled in a controlled, sequential manner. This prevents issues that could arise from multiple callbacks running at the same time. To unsubscribe from the listener, it returns a function that you can call.

## Function listenDoneBacktestOnce

This function lets you react to when a background backtest finishes, but only once. Think of it as setting up a notification that disappears after it triggers. You provide a filter – a rule to decide which completed backtests you care about – and a function that gets called when a matching backtest finishes. After that one execution, it automatically removes itself, so you don’t have to worry about cleaning up. It's a simple way to be notified of a specific backtest completion without ongoing subscriptions.


## Function listenDoneBacktest

This function lets you be notified when a background backtest finishes running. 

Think of it as setting up a listener that gets triggered once the backtest is done. 

It's designed to handle completion events in a safe and orderly fashion, even if your notification code takes some time to process – it queues up these events to make sure they run one at a time. You give it a function that gets called when the backtest is complete, and it returns a function you can use to unsubscribe from these notifications later.


## Function listenBreakevenAvailableOnce

This function lets you set up a one-time alert for when a specific breakeven protection condition is met. Think of it as a temporary listener: it waits for an event that matches your criteria, runs a function you provide once when it finds a match, and then stops listening. This is perfect if you need to react to a particular breakeven situation just once and don’t want to keep monitoring.

You provide a filter function that defines what kind of breakeven event you're interested in, and a callback function to execute when that event happens. Once the event is detected and the callback runs, the listener is automatically removed.


## Function listenBreakevenAvailable

This function lets you be notified when a trade's stop-loss automatically moves to breakeven – meaning the profit has covered all transaction costs. 

You provide a function that will be called whenever this happens. The function will receive information about the contract that reached breakeven.

Importantly, the framework ensures these notifications are handled one at a time, even if your notification function takes some time to complete, preventing any issues with multiple callbacks running simultaneously. It makes sure events are processed in the order they arrive.


## Function listenBacktestProgress

This function lets you keep an eye on how a backtest is running. It’s like setting up a listener that gets notified as the backtest progresses. The updates you receive will be processed one at a time, even if the code you provide to handle them takes some time to run. Think of it as a way to get a steady stream of progress reports during the backtest’s background processing. You give it a function that will be called whenever a progress event occurs, and it returns a function you can use to unsubscribe from those updates later.

## Function listenActivePingOnce

This function lets you react to specific active ping events and then automatically stop listening. 

Think of it as setting up a temporary listener – it waits for an event that meets your criteria, runs your provided function once when it finds one, and then quietly unsubscribes itself. 

You provide a filter function to define exactly which events you're interested in and a callback function to handle the event when it occurs. It’s perfect for situations where you need to react to something just once and don't want to keep the listener active indefinitely.


## Function listenActivePing

This function lets you keep an eye on active signals in your backtesting setup. It listens for events that are triggered every minute, giving you information about the signals' lifecycle. 

Think of it as a way to track what's happening with your signals dynamically and react accordingly. The events are handled one at a time, even if your callback function takes some time to process, ensuring a controlled flow. It's a handy tool for managing your signals effectively.

You provide a function that gets called whenever a new active ping event occurs, and this function will receive all the relevant details. When you’re finished listening, you can unsubscribe with the function that’s returned.

## Function listWalkerSchema

This function provides a way to see all the different trading strategies or "walkers" that are currently set up and ready to be used within the backtest-kit system. It essentially gives you a list of all the available options for how your backtesting can be approached. Think of it as a directory of all your trading "recipes". You can use this information to understand what's happening behind the scenes, generate documentation, or even build tools that adapt to the specific trading strategies you've configured.


## Function listStrategySchema

This function helps you discover all the trading strategies your backtest-kit setup knows about. It returns a list of descriptions for each strategy, allowing you to see what strategies are available. Think of it as a way to peek under the hood and understand which strategies are ready for testing or to dynamically display them in a user interface. It provides a straightforward way to access information about all strategies registered using the `addStrategy` function.

## Function listSizingSchema

This function lets you see all the sizing strategies that have been set up in your backtest. It gathers all the configurations you've created using `addSizing()` and puts them in a list. Think of it as a way to peek under the hood and understand how your order sizes are being determined, perfect for checking your work or building tools that display this information.

## Function listRiskSchema

This function provides a way to see all the risk configurations currently being used in your backtest. It returns a list of all the risk schemas that have been registered, which is handy for checking what's set up, creating documentation, or building user interfaces that adapt to the available risk models. Think of it as a peek under the hood to understand your risk setup.


## Function listMemory

This function helps you see all the stored memory entries associated with your current signal. 

It automatically figures out if you're in a backtest or live trading environment. 

The function pulls the symbol from the execution context and the signal ID from the active, pending signal. 

If there's no pending signal, it'll give you a heads-up with a warning and return an empty list of memory entries. You provide a bucket name to specify which memory to list.


## Function listFrameSchema

This function gives you a look at all the different "frames" or data structures your backtest kit is using. Think of frames as templates defining how data is organized for trading simulations. It returns a list of these templates, letting you see exactly what's available. This can be very helpful when you're trying to understand how your system is set up, creating tools to visualize the data, or just generally troubleshooting. It essentially shows you a catalog of all the custom data layouts you've defined.

## Function listExchangeSchema

This function gives you a way to see all the exchanges that are currently set up within your backtest kit. Think of it as a handy tool to inspect what trading venues your system knows about. It returns a list of these exchanges, which can be helpful for troubleshooting, creating documentation, or building user interfaces that adapt to the available exchanges. Essentially, it shows you the whole picture of your configured trading environment.

## Function hasTradeContext

This function quickly tells you whether the trading environment is ready for actions. It essentially confirms that both the execution and method contexts are available. Think of it as a check to make sure everything is set up correctly before you try to do things like fetch data or calculate values related to trades. If it returns true, it means you're good to go and can use functions that rely on the trading environment.


## Function hasNoScheduledSignal

This function helps you check if a scheduled signal is currently active for a specific trading pair, like "BTC-USD". It returns `true` if no signal is scheduled, which is helpful when you want to make sure a signal isn't generated prematurely. Essentially, it's the opposite of checking *for* a scheduled signal. The function cleverly figures out whether it's running in a backtesting environment or a live trading setting without you needing to specify. You simply provide the trading symbol you're interested in to get your answer.

## Function hasNoPendingSignal

This function, `hasNoPendingSignal`, checks if there's currently no signal waiting to be triggered for a specific trading pair. It's the opposite of `hasPendingSignal` and can be helpful to ensure your signal generation logic only runs when needed. The function figures out whether it's running in a backtest or a live trading environment on its own, so you don't have to worry about that. You simply provide the trading pair's symbol (like "BTCUSDT") to check.

## Function getWalkerSchema

The `getWalkerSchema` function helps you find details about a specific trading strategy or "walker" that's been set up in your backtest. Think of it as looking up the blueprint for a particular trading approach. You give it the name of the walker you're interested in, and it returns a description of how that walker works, including what data it uses and how it makes decisions. This is useful when you want to understand or interact with a particular trading strategy within your backtesting environment.


## Function getTotalPercentClosed

`getTotalPercentClosed` lets you quickly check how much of a position you still hold open. It gives you a percentage – 100 means you haven’t closed any part of your position, while 0 means it's completely closed out. 

The function handles situations where you've added to your position over time (like with dollar-cost averaging) and have made partial sales, ensuring the calculation is accurate.

It cleverly figures out whether it’s running in a backtest or live trading environment without needing to be told. You just need to provide the symbol of the trading pair you're interested in.


## Function getTotalCostClosed

`getTotalCostClosed` helps you figure out how much you've spent in total on a position you're currently holding. It calculates the cost in dollars, and it’s designed to work correctly even if you’ve been gradually adding to your position over time (like with dollar-cost averaging) and partially closing it. The function automatically determines whether it's running in a backtest or a live trading environment, so you don’t have to worry about manually setting that. You just need to give it the trading pair symbol (like BTCUSDT) to get the cost.

## Function getTimestamp

This function provides a way to retrieve the current timestamp within your trading backtests or live trading environment. It’s essentially a tool to know what time it is from the perspective of your trading system. When you’re running a backtest, it tells you the timestamp for the particular time slice you're currently analyzing. If you’re running live, it gives you the actual, real-time timestamp.

## Function getSymbol

This function allows you to retrieve the symbol being traded within your backtest or simulation. Think of it as a way to know which asset you're currently working with. It returns a promise that resolves to a string representing the trading symbol.

## Function getStrategySchema

The `getStrategySchema` function lets you look up information about a specific trading strategy that's been set up within the backtest-kit framework. Think of it like checking the blueprint for how a particular strategy is designed to work.  You provide the unique name you gave the strategy, and the function returns a detailed description of its structure and the properties it uses. This helps you understand the strategy's configuration and how it's intended to operate.


## Function getSizingSchema

This function helps you find the specific rules for how much of an asset to trade based on its name. Think of it as looking up a preset for your trading size. You provide a name, and it gives you back the details of how that sizing strategy works. It’s useful when you want to use a particular sizing approach within your backtesting setup.


## Function getScheduledSignal

This function helps you retrieve the signal that's currently set for a specific trading pair, like BTC-USDT. It's designed to find out what the strategy is currently instructed to do.

If there isn't a signal actively set for that pair, it will let you know by returning nothing. 

The function smartly figures out whether it's running in a backtest or a live trading environment, so you don't need to worry about that.

You just need to provide the symbol of the trading pair you're interested in, for example, "BTC-USDT".


## Function getRiskSchema

This function lets you fetch a specific risk schema that's already been registered within the backtest-kit system. Think of a risk schema as a blueprint for how to analyze risk—it defines what data to collect and how to interpret it. You provide the unique name of the risk you're interested in, and the function returns the corresponding schema that describes it. This is helpful for customizing and understanding how risk is being evaluated in your backtest.

## Function getRawCandles

The `getRawCandles` function lets you retrieve historical candlestick data for a specific trading pair and time interval. You can control how many candles you want, and specify a start and end date for the data. 

If you provide both a start and end date, the function will automatically determine the number of candles needed to cover that period. If you only provide a limit, it will fetch data from the execution context's established starting point.

The function is designed to ensure fair backtesting by preventing look-ahead bias, meaning it only uses data that would have been available at a given point in time. 

Here's a breakdown of the available options:

*   Specify a start date, end date, and limit to retrieve a defined number of candles within a specific range.
*   Just provide a start and end date to get all candles within that range.
*   Only provide a limit to get a set number of candles starting from the execution's starting point.

You'll need to provide the trading pair symbol (like "BTCUSDT") and the desired candle interval (like "1h" for one-hour candles).


## Function getPositionPnlPercent

This function helps you understand how your current trading strategy is performing. It calculates the unrealized profit or loss as a percentage, considering factors like partial trade executions, dollar-cost averaging, and even potential slippage and fees. 

Essentially, it gives you a quick snapshot of how much money you’ve potentially gained or lost on your open positions.

If there's no open position based on a pending signal, it will return null. The function smartly figures out whether you’re in a backtesting or live trading environment and fetches the current market price for accurate calculations. You just need to provide the symbol of the trading pair you’re interested in.

## Function getPositionPnlCost

This function helps you understand how much profit or loss you're currently holding on a trade. It calculates the unrealized profit or loss in dollars for a specific trading pair, considering things like how much you invested, any partial closes, and even potential slippage or fees. 

If there’s no active trade in progress for that symbol, it will return null. The function automatically figures out whether you’re running a backtest or a live trading simulation and it will also fetch the current market price to make the calculation. You only need to specify the trading pair symbol (like 'BTC-USDT') to get the result.

## Function getPositionPartials

getPositionPartials lets you peek into the history of partial profits or losses taken on a trade. It gives you a list of events where you’ve reduced your position, either for profit or to limit losses, using functions like commitPartialProfit or commitPartialLoss.

If no trades are currently in progress, you won't see anything. If you *have* committed partials, you'll get back a list detailing each one.

Each detail includes the type of partial (profit or loss), the percentage of the position closed, the price at which it was closed, the cost basis for accounting purposes at that time, and the number of DCA entries that were accumulated up to that point. You need to provide the trading pair symbol to check.

## Function getPositionPartialOverlap

This function helps you avoid accidentally executing multiple partial closes at roughly the same price level. It checks if the current market price falls within a defined range around any previously executed partial close prices.

Essentially, it's a safety measure to prevent duplicate orders.

It takes the trading symbol and the current price as input, and optionally a configuration for the acceptable price range. It returns true if the current price is within that range of a previous partial close, and false otherwise. This is helpful for managing your trading strategy and preventing unwanted order executions.

## Function getPositionMaxDrawdownTimestamp

getPositionMaxDrawdownTimestamp helps you find out when a specific trading position experienced its biggest loss. It gives you a timestamp – a precise moment in time – indicating when that low point occurred. If there's no active trading signal for that position, the function will return null, meaning it can't determine a maximum drawdown timestamp. You provide the symbol of the trading pair (like BTC/USDT) to the function to get this historical drawdown information.

## Function getPositionMaxDrawdownPrice

This function helps you find the lowest price a specific trade ever reached while it was open. It essentially shows you the biggest drop in price you experienced during that trade.

If no trades are currently active for a given trading pair, the function won't return anything.

To use it, you simply need to provide the symbol of the trading pair you’re interested in, like "BTCUSDT." The function will then calculate and return the maximum drawdown price for that symbol.


## Function getPositionMaxDrawdownPnlPercentage

This function helps you understand the risk associated with a specific trade. It calculates the maximum percentage loss experienced by a position on a particular trading pair. Essentially, it tells you how far "in the red" the position went at its lowest point. If there's no active signal for the symbol, the function won't return any data, represented as null. You provide the symbol of the trading pair (like BTCUSDT) to see the drawdown for that position.

## Function getPositionMaxDrawdownPnlCost

This function helps you understand how much money you lost at the absolute worst point during a trade. It looks at a specific trading pair, like 'BTC-USD', and tells you the profit and loss (expressed in the quote currency, like USD) that occurred when the price hit its lowest point for that position. 

If there’s no active trading signal for that pair, it won't return a value; instead, you'll get null. Essentially, it’s a way to quantify the pain of your biggest loss during a trade.

## Function getPositionMaxDrawdownMinutes

getPositionMaxDrawdownMinutes tells you how long ago your position hit its lowest point. It's basically a measure of how far down it's been since the worst price.

The value represents the number of minutes passed since that low point. If the price is currently at its lowest, the value will be zero. 

If there’s no active trading signal for the specified symbol, this function returns null.

You provide the symbol, like "BTCUSDT", to check for the drawdown of a specific trading pair.


## Function getPositionLevels

`getPositionLevels` helps you understand where your current trading strategy is positioned. It fetches the prices at which your trades were placed, specifically for a given trading pair like 'BTCUSDT'.

Think of it as looking at your trade history – it reveals the initial entry price and any subsequent prices used when averaging into a position through DCA (Dollar-Cost Averaging).

If no trades are pending, it will return nothing. If you only made one trade and didn't use DCA, you'll see an array containing only the initial entry price.


## Function getPositionInvestedCount

This function helps you track how many times you've added to a trade using dollar-cost averaging (DCA). It tells you the number of DCA entries made for the currently active signal.

A value of 1 means it's the original purchase, and each time you use `commitAverageBuy()` successfully, that number goes up.

If there's no signal currently being tracked, the function will return null.

The function figures out whether it's running in a backtest or a live trading environment automatically.

You just need to provide the trading pair symbol (like BTCUSDT) to check the DCA count.

## Function getPositionInvestedCost

This function helps you find out how much money is tied up in a trading position, specifically looking at the costs associated with getting into that position. It calculates the total cost of all the buys used to establish the current open position.

Essentially, it adds up the entry costs for each buy order. These costs are originally set when the average buy order is committed.

If there isn’t a pending signal, the function will return null, indicating no position cost is available. The function works whether you're doing a backtest or live trading—it figures that out automatically.

To use it, you just provide the symbol of the trading pair you are interested in.

## Function getPositionHighestProfitTimestamp

This function helps you find the exact moment when a particular trading position reached its highest profit. 

It takes the symbol of the trading pair (like BTCUSDT) as input and returns a timestamp – essentially, a numerical representation of the date and time. 

Think of it as identifying the peak profitability point for a specific trade. 

If there's no active trading signal for that symbol, the function will return null, indicating that it can’t determine a highest profit timestamp.


## Function getPositionHighestProfitPrice

This function helps you understand the best price your open trade has achieved in a profitable direction. 

It starts by recording the initial entry price when the trade begins. 

As the market moves, it constantly updates this "highest profit price" – for long positions, it looks for the highest price above your entry price; for short positions, it looks for the lowest price below your entry price.

You'll always get a value back – it’s guaranteed to contain at least the entry price because it exists when a trade is active. It gives you insight into how well your trade has performed so far.


## Function getPositionHighestProfitMinutes

`getPositionHighestProfitMinutes` helps you understand how long a trading position has been operating below its best-ever profit level. It tells you the number of minutes that have passed since the price reached its highest point for that specific trading pair. Think of it as a way to gauge how far the price has fallen from its peak. If the position was just started and reached its best price immediately, the value will be zero. The function returns `null` if there's no active trading signal for the given symbol.


## Function getPositionHighestProfitDistancePnlPercentage

This function helps you understand how far your trading position is from its best performance. It calculates the difference between the highest profit percentage achieved so far and the current profit percentage. 

Essentially, it tells you how much room there is for improvement or how much ground has been lost.

The value returned is a percentage, and it will always be a positive number or zero – representing the potential upside. 

If there's no trading signal currently active, the function won’t return a value.

You provide the trading pair symbol (like BTCUSDT) to specify which position you’re interested in.


## Function getPositionHighestProfitDistancePnlCost

This function helps you understand how far your current trading position is from its potential maximum profit. It calculates the difference between the highest profit achieved so far and the current profit, but only considers positive differences – meaning it only looks at how much further you could have gone to reach that peak. If there’s no active trading signal for the specified symbol, it won't be able to calculate this distance. To use it, you just need to provide the trading pair symbol.

## Function getPositionHighestProfitBreakeven

This function helps you determine if a trade position could have reached a breakeven point at its peak profitability. 

It essentially checks if it was possible to avoid losses based on the highest price achieved during the trade.

The function takes the trading pair symbol (like 'BTCUSDT') as input.

If no trading signals exist for that symbol, the function will not return anything.


## Function getPositionHighestPnlPercentage

This function helps you understand how well a specific trade performed. It calculates the highest percentage profit achieved by a position during its entire lifespan. 

Essentially, it tells you the peak profitability for a given trading pair. 

If there's no active signal related to that pair, the function will return null, indicating it can't provide a value. You just need to pass the trading pair's symbol (like BTC-USDT) to see the result.

## Function getPositionHighestPnlCost

This function helps you understand the financial performance of a specific trading position. It tells you the total cost (expressed in the currency of the quote asset) incurred up to the point when the position reached its highest profit. Essentially, it's looking back at the position's history to find the moment of peak profit and then calculating the cost associated with holding the position up to that point. If there's no pending signal related to the position, the function won't be able to provide a value and will return null. You simply provide the symbol of the trading pair you're interested in.

## Function getPositionHighestMaxDrawdownPnlPercentage

This function helps you understand the risk associated with a specific trading position. It calculates the largest percentage loss experienced from a peak to a trough in the position's profit and loss.

Essentially, it tells you how far your position's profit has fallen from its highest point.

The returned value represents that percentage difference. If no trading signals are present, the function will return null. To use it, you simply need to provide the symbol of the trading pair, such as 'BTC-USDT'.


## Function getPositionHighestMaxDrawdownPnlCost

This function helps you understand the potential downside risk of a trading position. It calculates the difference between the current profit and loss (PnL) and the lowest point (trough) of any losses experienced so far. 

Essentially, it tells you how much further the price would need to fall to reach a new low point for your position.

The function takes the trading symbol (like "BTC-USD") as input and returns this distance as a number. If there's no active trading signal for that symbol, it won't be able to perform the calculation and will return null.


## Function getPositionEstimateMinutes

getPositionEstimateMinutes helps you understand how long a trading position is expected to last. It tells you the originally estimated duration, based on the signal's data. 

Essentially, it reveals the maximum number of minutes the position is expected to stay open before the `time_expired` event. 

If there's no active or pending signal, the function will return null. You need to provide the symbol of the trading pair you're interested in to get this estimate.

## Function getPositionEntryOverlap

This function helps you avoid accidentally entering the same DCA level multiple times. It checks if the current price is close to any existing price levels you've already set up for a specific trading pair. 

Essentially, it prevents you from making duplicate DCA entries in the same price range.

The function looks at the price you're currently trading at and compares it to your existing price levels, considering a small tolerance range around each level. If the current price falls within that tolerance, the function returns true, letting you know you should probably reconsider the entry. If there are no existing levels, it returns false.

You can customize how wide that tolerance range is using the `ladder` parameter, which allows you to define the acceptable percentage difference up and down from each level.

## Function getPositionEntries

getPositionEntries lets you peek at the history of how a trade was built, specifically looking at the individual steps in a DCA (Dollar-Cost Averaging) strategy. It gives you a list of prices and costs for each purchase made when building up a position.

Think of it like reviewing a trail of breadcrumbs that show exactly how a position was accumulated, starting from the initial entry and including any subsequent DCA commits. 

If there's no ongoing trade being built, the function will tell you so by returning nothing. If a single initial trade was made without any further DCA steps, you'll get a list containing just one entry.

You need to provide the trading pair's symbol (like BTCUSDT) to tell the function which position history you're interested in. The result will include the price at which each entry was made and the amount of money spent on it.

## Function getPositionEffectivePrice

getPositionEffectivePrice lets you find the average entry price for a trade that's still in progress. It calculates this price by considering all the buys and sells, weighting them by their cost.

If you've made partial sales, it factors those in too, figuring out the price based on when those partials happened, and then adding in any subsequent buys.

If there are no buys at all, it will return the original opening price.

If there's no trade currently being tracked, it will return null. It intelligently knows whether it's running a backtest or a live trade, without you needing to tell it.

You just need to provide the symbol of the trading pair, like "BTCUSDT".

## Function getPositionDrawdownMinutes

`getPositionDrawdownMinutes` helps you understand how far your trading position is from its best performance. It tells you, in minutes, how long it’s been since the price reached its highest point for that trade. Think of it as a measure of how much the price has dipped from its peak. The value will start at zero when the price hits its peak and will increase as the price moves downward. If there's no active trade happening, it won't be able to provide a number.

You provide the trading pair symbol (like BTCUSDT) to check the drawdown for that specific trade.

## Function getPositionCountdownMinutes

This function helps you determine how much time is left before a trading position expires. It calculates the countdown based on when the position became pending and a pre-defined estimate.

If everything goes as planned, you'll get a number representing the remaining minutes.

However, if a position isn't pending, the function will return null, indicating no countdown is available. 

The countdown will never be a negative number; it’s always clamped to zero, ensuring a realistic representation of the remaining time. The function requires you to specify the trading pair symbol as input.

## Function getPendingSignal

This function lets you check if a trading strategy has a pending order currently waiting to be executed. It tells you what that signal is, if one exists. 

If there's no pending signal at the moment, the function will simply return nothing. 

It figures out whether it's running a backtest or a live trading session automatically, so you don’t have to worry about that.

To use it, you just need to provide the trading pair symbol, like 'BTCUSDT'.


## Function getOrderBook

This function lets you retrieve the order book for a specific trading pair, like BTCUSDT. 

It pulls data from the connected exchange.

You can optionally specify how many levels of the order book you want to retrieve; if you don't specify, it defaults to a reasonable maximum. 

The function accounts for the current time when fetching data, ensuring accurate order book information whether you're backtesting or trading live.


## Function getNextCandles

This function helps you get future candles for a specific trading pair and timeframe. It’s designed to work with the trading platform's way of fetching data, ensuring you’re getting candles that come *after* the current time the system is using.

You provide the symbol like "BTCUSDT", the interval like "1h" (for one-hour candles), and the number of candles you want.  The function then returns those candles in a structured data format. Think of it as requesting a chunk of future candles for analysis or order placement.


## Function getMode

This function simply tells you whether the backtest-kit framework is currently running a simulation (backtest) or a live trading session. It's a straightforward way to check the context of your code – for example, you might want to disable certain actions during backtesting to avoid unintended consequences. The function returns a promise that resolves to either "backtest" or "live", clearly indicating the current operational mode.

## Function getFrameSchema

This function lets you look up the structure and expected data types for a specific frame within your backtest. Think of it as getting a blueprint for what a frame should look like. You provide the name of the frame you're interested in, and it returns a detailed description of its contents, which is helpful for understanding how to work with the data in that frame. This is particularly useful for ensuring your data aligns with the framework's expectations.

## Function getExchangeSchema

This function lets you fetch the details of a specific cryptocurrency exchange that's been set up within the backtest-kit system. Think of it as looking up the configuration for an exchange like Coinbase or Binance. You provide the name of the exchange you’re interested in, and it returns a structured object containing all the information needed to interact with that exchange during a backtest. This includes things like the API endpoints, data formats, and supported trading pairs.

## Function getDefaultConfig

This function provides a starting point for configuring your backtesting environment. It gives you a set of preset values for various settings, controlling things like how often the system checks for new signals, how it handles slippage and fees, and limits on the number of signals and logs it generates. Think of it as a template—you can copy this configuration and then adjust the values to tailor the backtest to your specific strategy and needs. It's a useful way to get familiar with all the configuration options available.

## Function getDefaultColumns

This function provides the standard set of columns used when creating reports. 

Think of it as a template for the columns that appear in your backtest reports, like those showing performance metrics, risk indicators, or strategy events. 

It returns a snapshot of these columns and their initial configurations, so you can explore the available options and understand how they're structured before customizing your own report layouts. It's a handy way to see exactly what's possible.

## Function getDate

This function lets you retrieve the current date within your trading strategy or analysis. Think of it as a way to know what date your backtest is simulating, or what the actual current date is if you're running a live trade. It returns a date object, so you can easily format or manipulate it as needed. Essentially, it provides the date context for your trading logic.

## Function getContext

This function lets you access important details about the current process within your backtest. Think of it as a way to peek under the hood and see what’s happening during a specific step in your trading strategy. It provides a context object filled with information that can be useful for debugging or adjusting your approach. You'll use this to understand where you are in the execution flow.

## Function getConfig

This function allows you to peek at the system's settings. It provides a snapshot of all the configuration values, like how often things are checked, limits on data processing, and various parameters controlling the backtesting and trading behavior. It's a read-only view – any changes you make to the returned object won’t affect the actual running configuration. Think of it as a way to understand how the system is currently set up. The configuration covers things from candle fetching to notification limits and advanced features like DCA and trailing stops.

## Function getColumns

This function lets you see what columns are being used to build your backtest reports. It provides a snapshot of the column setup – things like the columns for closed trades, performance data, or risk events. 

Think of it as peeking at the structure of your report before it's built. The function returns a copy, so any changes you make won't affect the actual configuration used by the backtest. It’s a safe way to understand how your report is organized.

## Function getCandles

This function helps you retrieve historical price data, or "candles," from an exchange. You provide the trading pair you're interested in, like "BTCUSDT," along with the time interval for the candles – options include 1 minute, 5 minutes, hourly, and more. Specify how many candles you want, and the function will fetch that amount of data, working backward from the current time. It essentially uses the exchange's built-in method for fetching this kind of information.


## Function getBreakeven

This function helps determine if a trade has become profitable enough to cover the initial costs. It checks if the current price of a trading pair has moved beyond a specific threshold, accounting for slippage and fees. Essentially, it tells you if you’ve made enough profit to break even on the trade. The function handles whether you're in a backtesting simulation or a live trading environment automatically. You'll need to provide the trading pair symbol and the current market price to use it.

## Function getBacktestTimeframe

This function helps you find out the dates and times that your backtest is using for a specific trading pair, like BTCUSDT. It returns a list of dates, showing the period the backtest covers. You give it the symbol of the trading pair you're interested in, and it tells you what dates were used in the backtest for that pair. This is useful for understanding the scope of your backtesting analysis.

## Function getAveragePrice

This function helps you determine the VWAP (Volume Weighted Average Price) for a specific trading pair, like BTCUSDT. It looks at the most recent five-minute intervals of price data.

Essentially, it figures out the average price weighted by how much was traded at each price point.

If there's no trading volume available, the function defaults to calculating a simple average of the closing prices instead.

To use it, you just need to provide the symbol of the asset you want to analyze, like "BTCUSDT."

## Function getAggregatedTrades

This function retrieves a list of aggregated trades for a specific trading pair, like BTCUSDT. It pulls this data directly from the exchange you've configured.

You can request all trades within a certain time window if you don't specify a limit. If you need just a few, you can set a limit to retrieve a specific number of trades. The function will fetch trades in reverse chronological order, starting from the present time.

## Function getActionSchema

This function lets you grab the details of a specific action that's been set up within the backtest-kit framework. Think of it as looking up the blueprint for how a particular action should work. You provide the action's unique name, and it returns a structured description – the schema – that defines that action. This schema contains all the information you need to understand and use the action correctly.

## Function formatQuantity

The `formatQuantity` function helps you ensure that the quantity you're using for trades is displayed correctly according to the specific exchange's rules. It takes the trading pair symbol, like "BTCUSDT", and the raw quantity value as input. It then uses the exchange's formatting logic to ensure the correct number of decimal places are used, which is crucial for valid orders. Essentially, it does the heavy lifting of adhering to exchange-specific formatting requirements so you don't have to.


## Function formatPrice

This function helps you display prices correctly for different trading pairs. It takes a symbol like "BTCUSDT" and a raw price as input. 

It then uses the specific rules for that exchange to format the price, ensuring it shows the right number of decimal places. This is especially useful because different exchanges handle decimal places differently. 

Essentially, it makes sure your prices look professional and follow the expected format for each trading pair.


## Function dumpText

This function helps you record raw text data, like notes or analysis, associated with a specific trading signal. Think of it as a way to create a permanent record of your thought process during a trade. It automatically figures out which signal it belongs to based on the current trading context. If there isn't a signal currently active, it will alert you so you don’t accidentally lose the information. 

You provide the function with the data you want to save, including a name for the data bucket, a unique ID, the text itself, and a description to explain what the text represents. The function then handles storing that information.


## Function dumpTable

This function helps you display data in a neat, table format, specifically when you're working with trading signals. It takes an array of objects (think of them as rows in your table) and presents them in a readable way. The function automatically figures out the column headers based on all the different keys (or labels) used in your data.

Importantly, it relies on the context of an active trading signal to understand where the data belongs. If no signal is found, it'll give you a heads-up and won't proceed. 

Essentially, it's a convenient tool for inspecting and understanding your trading data.


## Function dumpRecord

This function helps you save a record – think of it as a set of data points – to a storage bucket. It's designed to be used within the backtest-kit framework, automatically knowing which test run it belongs to.  Essentially, it takes your data and a description, and writes it out for later analysis. If there isn't an active test run, it will let you know with a warning instead of proceeding. It's a convenient way to persist interesting data during your backtesting.


## Function dumpJson

The `dumpJson` function lets you save complex data structures as JSON within your backtesting environment. It's like creating a snapshot of your data, formatted as a neatly organized JSON block, that's tied to the specific trading signal being analyzed.

If there’s a signal currently being processed, the function automatically pulls the signal identifier. However, if no signal is active, it will alert you with a warning and won't proceed.

You provide the function with the name of a bucket, a unique identifier for the dump, the actual data as a JavaScript object, and a descriptive label to help you remember what the data represents. This function is helpful for debugging, inspecting data at specific points in a simulation, or archiving relevant state.


## Function dumpError

The `dumpError` function helps you record and track errors within your trading backtests. It takes detailed information about an error—like a description, a unique identifier (`dumpId`), and the name of the data bucket—and saves it for later analysis. The function automatically associates this error with the currently active trading signal, ensuring that errors are linked to the specific trading activity that generated them. If there's no active signal, it will simply log a warning and not proceed with the dump. This feature is useful for debugging and understanding why a strategy performed the way it did.

## Function dumpAgentAnswer

This function helps you save the complete conversation history with the agent, specifically related to a particular trading signal. It automatically figures out which signal it belongs to based on the current context. If it can't find a signal to associate with, it'll let you know with a warning and won't save anything. 

You provide the function with details like the bucket name, a unique identifier for the dump, the messages exchanged, and a brief description of the content. This allows you to easily review and analyze past agent interactions.


## Function commitTrailingTakeCost

This function lets you set a specific, absolute price for your trailing take-profit order. It automatically figures out the best way to do this based on whether you're in a backtest or a live trading environment. 

It cleverly recalculates the percentage shift needed to reach your desired take-profit price, referencing the original take-profit distance you initially set. The function also gets the current market price to make sure the adjustment is accurate.

You'll need to provide the symbol of the trading pair and the new price you want to set as your take-profit level. It returns a boolean value indicating whether the adjustment was successful.

## Function commitTrailingTake

This function lets you fine-tune your trailing take-profit orders for a specific trade. It's designed to subtly adjust the distance of your take-profit order from the initial target price.

It's really important to understand that this adjustment is always calculated based on the *original* take-profit level you set, not the current, potentially shifted one. This prevents small errors from building up over time.

When you adjust the take-profit, the function only makes changes that make the take-profit *more conservative* – meaning it moves the take-profit closer to your entry price.  For long positions, it only lowers the take-profit; for short positions, it only raises it.

You specify how much to adjust the take-profit as a percentage, and also the current market price for reference. The function automatically figures out whether it's running in a backtesting environment or a live trading situation.

## Function commitTrailingStopCost

This function lets you change the trailing stop-loss order to a specific price. Think of it as manually setting the stop-loss to a new level.

It simplifies the process by automatically calculating the right percentage shift based on the original stop-loss distance you set up.

The function figures out whether you're in a backtest or live trading environment on its own, and also gets the current price to make the adjustments accurately.

You provide the trading symbol and the desired new stop-loss price, and it takes care of the rest.


## Function commitTrailingStop

The `commitTrailingStop` function lets you fine-tune the trailing stop-loss distance for your trading signals. It's important to understand that it always calculates adjustments based on the original stop-loss distance, preventing errors from building up with repeated use. 

Think of it like this: you're telling the system to nudge the stop-loss further away (positive `percentShift`) or closer (negative `percentShift`) from your initial entry point.

The system is smart about updates; it only changes the stop-loss if the new distance actually offers better protection – more profit to safeguard. For long positions, the stop-loss can only move further away, while for short positions, it can only move closer.

The function automatically knows whether it's operating in a backtesting environment or live trading, so you don't need to specify that.

It needs the trading symbol, the percentage adjustment you want to make, and the current market price.

## Function commitPartialProfitCost

The `commitPartialProfitCost` function helps you automatically close a portion of your trading position when it’s in profit, based on a specific dollar amount. 

It simplifies the process by figuring out the percentage of your position needed to close based on the dollar value you provide. 

Essentially, you tell it how much profit in dollars you want to secure, and it handles the rest, ensuring the price is trending favorably.

It works seamlessly whether you’re backtesting or live trading, and automatically fetches the current price to calculate the position size.

You provide the trading symbol and the dollar amount you wish to close, and the function takes care of the rest.


## Function commitPartialProfit

This function lets you automatically close a portion of your open trade when the price moves favorably, helping you secure profits along the way. It's designed to close a specific percentage of your position – for example, 50% – when the price is heading towards your target profit level. The system will figure out if it’s running in a testing environment or a live trading setting without needing extra configuration. 

You provide the trading pair you're working with (like 'BTCUSDT') and the percentage of the position you want to close. It will then handle the closing action for you, as long as the price is moving in the desired direction.

## Function commitPartialLossCost

This function helps you partially close a trading position when it's moving towards your stop-loss, but you want to do it based on a specific dollar amount. It simplifies the process by automatically calculating the percentage of your position needed to close based on the dollar value you provide. The function handles whether you’re in a backtesting or live trading environment, and it also grabs the current market price for you to ensure accurate calculations. You just need to specify the trading symbol and the dollar amount you wish to close.

## Function commitPartialLoss

This function lets you automatically close a portion of your open trades when the price moves against you, essentially moving toward your stop-loss level. 

It's designed to close a specific percentage of your position – you tell it how much to close, like 20% or 50%.

The system automatically handles whether you're running a backtest or a live trade.

To use it, you'll specify the trading symbol and the percentage of the position you want to close. For example, you could use it to automatically reduce your exposure if a trade starts to move unfavorably.


## Function commitClosePending

This function lets you manually close a pending order that your trading strategy has already set up. It’s useful if you want to override the strategy's planned action without completely stopping its operation. Think of it as cancelling a trade that's already in progress but allowing your strategy to keep running and generating new signals. It doesn't affect any scheduled trades and won't pause your strategy’s normal signal creation.  You can also include an ID to help you keep track of why you decided to close the pending order. The framework will automatically figure out if it's running in a backtest or live trading environment.


## Function commitCancelScheduled

This function lets you cancel a signal that's been scheduled for future execution, essentially removing it from the plan. Think of it as a way to change your mind about a potential trade. It's designed to be non-disruptive; it won't halt your overall strategy or impact any trades already in progress.

It's particularly useful if you need to adjust a strategy's actions mid-backtest or during live trading.

You can optionally provide a cancellation ID to help you keep track of which cancellations were started by your code. The framework will automatically adjust its behavior based on whether it’s running a backtest or a live trade.


## Function commitBreakeven

The `commitBreakeven` function helps automate your trading risk management. It automatically adjusts your stop-loss order to break even, essentially removing the risk of loss, once the price moves favorably enough to cover your transaction costs and a small buffer. 

It calculates this "favorable enough" point based on a combination of slippage and fee percentages. This function handles the details of determining the current price and works whether you’re running a backtest or a live trade.

You simply provide the trading pair symbol (like BTCUSDT) and it will manage the stop-loss adjustment for you.

## Function commitAverageBuy

The `commitAverageBuy` function helps automate adding to your positions using dollar-cost averaging. It essentially records a new purchase at the current market price as part of your overall entry strategy. This function is smart enough to know whether it's running in a backtest or live trading environment and will automatically retrieve the current price. It also keeps track of the average price you've paid for the asset and broadcasts a notification that a new buy order has been placed. You can optionally specify a `cost` parameter, though its use is not currently defined.

## Function commitActivateScheduled

This function lets you manually trigger a scheduled signal before the price actually hits the intended level. It's useful when you want to react to a signal immediately instead of waiting for the price to move. Think of it as a way to jumpstart a planned trade. When you use this, the system knows it's a manual activation, and it will remember that for tracking purposes if you provide an activation ID. The framework automatically handles whether it's being used in a backtest or a live trading environment.

## Function checkCandles

The `checkCandles` function is a tool to ensure your historical price data, or "candles," are properly aligned with the time intervals you're using for trading. It essentially verifies that the timestamps associated with each candle are accurate. 

This function dives deep into your saved data, reading the information directly from JSON files to perform this check. It bypasses any intermediary layers, allowing for a very focused and precise validation process. If you're experiencing issues with backtesting accuracy or unexpected results, running `checkCandles` can help identify problems related to your candle data.


## Function addWalkerSchema

This function lets you add a new strategy "walker" to the backtest-kit system. A walker is essentially a way to run multiple trading strategies against the same set of historical data and see how they perform relative to each other. Think of it as a tool to compare different approaches to trading and understand which one might be more effective. You provide a configuration object defining how this comparison should be conducted.

## Function addStrategySchema

This function lets you tell backtest-kit about a new trading strategy you want to use. Think of it as registering your strategy with the system.

When you register a strategy, backtest-kit will check that it's set up correctly – things like verifying the prices used for signals and making sure your take-profit and stop-loss logic works as expected. 

It also helps prevent issues like too many signals being generated too quickly and ensures that your strategy's data can be safely saved even if there's a problem with the system. You provide the framework with a description of your strategy using a special object called `IStrategySchema`.


## Function addSizingSchema

This function lets you tell the backtest kit how to determine the size of your trades. Think of it as setting up the rules for how much money you'll risk on each trade. 

You'll define things like whether you want to risk a fixed percentage of your capital, use a Kelly Criterion approach, or base sizing on ATR values. 

It also allows you to specify constraints, like minimum or maximum trade sizes, and even customize the sizing process with your own logic using callbacks. Essentially, this registers a plan for managing your position sizes during the backtest.


## Function addRiskSchema

This function lets you register a risk management plan with the backtest kit. 

Think of it as setting up rules to keep your trading safe. 

It allows you to define limits, like the maximum number of simultaneous trades across all your strategies, and add more complex checks for things like how your investments relate to each other. 

The best part is that several trading strategies can use the same risk plan, so you get a complete view of your overall risk exposure. The system keeps track of all open trades and makes it available to your custom validation checks.


## Function addFrameSchema

This function lets you tell backtest-kit about a new timeframe generator you want to use. Think of it as adding a new way to slice up your historical data for testing. You provide a configuration object that describes the timeframe’s start and end dates, the interval (like daily, weekly, or monthly), and any special actions you want to happen when a new timeframe is created. Essentially, you’re setting up the rules for how your backtest data will be structured.

## Function addExchangeSchema

This function lets you tell the backtest-kit framework about a new data source for an exchange. Think of it as registering a new place where the backtest can pull historical price data.

When you register an exchange, it allows the backtest kit to understand how to fetch historical candles, format prices and quantities, and even calculate common indicators like VWAP.

You’ll need to provide a configuration object that defines the details of the exchange – things like how to access the data and how to interpret the prices.

## Function addActionSchema

This function lets you tell the backtest-kit framework about a specific action you want to perform during a backtest. Think of actions as a way to trigger things like sending notifications, logging events, or updating external systems whenever certain events happen in your trading strategy. 

You're essentially registering a blueprint for how these actions should behave.

Each action gets a unique instance linked to a specific strategy and timeframe, allowing it to react to every event that occurs, such as signals generated or profits earned. This lets you build customized integrations for state management, real-time alerts, and tracking metrics.
