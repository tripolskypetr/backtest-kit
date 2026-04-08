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

The `writeMemory` function lets you store data – think of it as saving information – within a specific memory location tied to the current trading signal. It's designed to hold any kind of data represented as an object.

It automatically figures out whether you're in a backtesting or live trading environment.

To use it, you'll provide a description of what you want to save, a unique name for the memory bucket, a unique identifier for the memory location within that bucket, and the actual value you wish to store.

Importantly, the function relies on a pending signal to know where to store the data; if no signal is active, it’ll simply alert you with a warning and won’t proceed with writing the memory.


## Function warmCandles

This function helps prepare your backtesting environment by pre-loading historical price data (candles). It downloads and stores candles for a specified period, from a starting date (`from`) to an ending date (`to`), using a particular time interval. Think of it as warming up the system with the data it will need, so backtests run faster and more efficiently. You provide the starting and ending dates, along with the desired interval, and it takes care of fetching and persisting the data. This is particularly useful for reducing latency during backtesting and ensuring you're working with a complete dataset.

## Function validate

This function helps you double-check that everything is set up correctly before you start a backtest or optimization. It verifies that all the names you're using for things like exchanges, trading strategies, risk parameters, and sizing methods actually exist in the system.

You can tell it to validate specific parts, or let it check *everything* – it’s a handy way to catch potential errors early on. 

The validation checks are stored to make things run faster if you need to run them again.

Essentially, it's a safeguard to prevent problems down the line caused by misspellings or missing configurations.

## Function stopStrategy

This function allows you to halt a trading strategy's signal generation. 

It effectively pauses the strategy, preventing it from creating any new trading signals. Any existing open signals will still run to completion. 

Whether you're in a backtesting or live trading environment, the process will gracefully stop at a suitable point, like when the strategy is idle or a signal has finished.

You only need to specify the trading pair symbol to stop the strategy.

## Function shutdown

This function provides a way to cleanly end a backtest. It sends out a signal that lets all parts of the backtest know it's time to wrap up. This is useful when you want to stop the backtest process properly, like when you press Ctrl+C, to make sure everything cleans up correctly before exiting.

## Function setLogger

You can now control how backtest-kit reports its activities. This function lets you plug in your own logging system. It will automatically include helpful details like the strategy name, exchange, and symbol with each log message, so you have more context when debugging or analyzing your backtesting results. Just provide an object that follows the `ILogger` interface to get started.

## Function setConfig

This function lets you adjust how the backtest-kit framework operates. You can tweak certain settings to suit your needs, like changing how data is handled or how results are displayed. The `config` argument allows you to selectively change just the parts of the configuration you want to modify; you don't have to redefine everything.

Be careful though – there's an `_unsafe` option. Using this skips important checks, so only use it when you absolutely need to, typically in testing environments.

## Function setColumns

This function lets you customize the columns that appear in your backtest reports, like the ones generated in markdown format. You can essentially change what information is displayed and how it’s organized.

It’s designed to allow you to override the default column settings for any report type.

Before applying your changes, the framework checks to make sure your column definitions are structurally sound.

There's a special `_unsafe` flag you can use.  It disables those validations, which is mainly needed for testing purposes.

## Function searchMemory

The `searchMemory` function helps you find relevant data stored in your memory system based on a text query. 

It essentially allows you to search for memory entries related to a particular signal.

The function automatically determines whether it's running in a backtest or live trading environment.

If there isn't a signal currently being processed, it will give you a heads-up with a warning message and will not return any results.

You provide a search query string and the name of the memory bucket to look in, and it returns an array of matching entries along with a score indicating their relevance. The returned entries include a unique ID, the score, and the full content of the memory entry.


## Function runInMockContext

This function lets you execute a piece of code as if it were running within a trading backtest or live trading environment, but without actually running a full backtest.

It's incredibly handy for writing tests or quick scripts where you need to access information like the current trading timeframe or other context-dependent data.

You can customize the context by providing parameters like the exchange name, strategy name, symbol, and whether it's a backtest or live mode. If you don't provide these details, it uses reasonable defaults to simulate a basic live trading scenario. 
The `when` parameter defaults to the current minute, which can be helpful for timing-related operations.


## Function removeMemory

This function lets you clean up memory entries related to a specific signal. It’s designed to remove old data associated with a signal, ensuring your system doesn't hold onto unnecessary information. 

It identifies the symbol being used and the signal's ID. If there isn't an active signal to work with, it'll simply log a warning and do nothing. The function also automatically knows whether it’s running in a backtesting or live environment.

You provide the function with a data transfer object (DTO) containing the bucket name and the unique identifier of the memory entry you want to remove.


## Function readMemory

The `readMemory` function lets you retrieve data stored in a specific memory location tied to your current trading signal. Think of it as pulling information from a labeled container.

It requires you to specify the `bucketName` – essentially the name of the container – and the `memoryId`, which acts like the specific label on that container.

This function smartly figures out whether you’re in a backtesting or live trading environment.

If no active signal is present, it will let you know by logging a warning and will return `null` because there's no signal to associate the memory with.  The data retrieved will be of a type you define, or a generic object if no type is specified.


## Function overrideWalkerSchema

This function lets you tweak an existing trading strategy's walker configuration—think of it as a way to modify how the strategy analyzes historical data for comparison purposes.  You provide a partial set of changes, and the function merges those into the existing walker schema.  It’s useful if you want to adjust specific settings without completely redefining the entire walker. Essentially, it allows focused adjustments to the walker’s setup for more detailed backtesting analysis. The function returns a promise that resolves to the updated walker schema.

## Function overrideStrategySchema

This function lets you modify a trading strategy that's already set up within the backtest-kit framework. Think of it as a way to tweak a strategy’s settings without completely rebuilding it. You provide a new configuration – just the parts you want to change – and the function updates the existing strategy, leaving everything else untouched. It’s useful for making adjustments to strategies as you learn more or need to fine-tune their behavior.

It takes a configuration object as input, containing the fields you want to update in the strategy.

## Function overrideSizingSchema

This function lets you adjust how your trading positions are sized within the backtest-kit framework. Think of it as fine-tuning an existing sizing plan rather than creating one from scratch. You can selectively change certain aspects of your sizing configuration, such as the amount of capital allocated per trade, while leaving the rest of the original settings untouched. It's useful when you need to make small modifications to a sizing strategy without redefining the entire thing.

## Function overrideRiskSchema

This function lets you tweak an existing risk management setup. Think of it as making small adjustments to a configuration that's already in place. You provide a portion of the risk configuration you want to change, and only those specific details are updated – the rest of the original configuration stays as it was. This is useful for fine-tuning your risk controls without having to rebuild the entire setup.

## Function overrideFrameSchema

This function lets you adjust the settings for a specific timeframe you're using in your backtesting. It's a way to tweak things without having to completely redefine the timeframe from scratch. You provide a portion of the timeframe’s configuration – just the parts you want to change – and it merges those changes with the existing settings. Think of it as a targeted update for your timeframe. The original settings stay put, only the modifications you provide will be applied.

## Function overrideExchangeSchema

This function lets you modify an existing exchange data source within the backtest-kit framework. Think of it as a way to tweak a previously set-up exchange – you don't need to recreate it entirely.  You only need to provide the parts of the exchange configuration you want to change, and everything else will stay as it was before. It’s particularly useful for making small adjustments or updates to an exchange without a full re-registration. The function returns the updated exchange schema.


## Function overrideActionSchema

This function lets you tweak existing action handlers within the backtest-kit framework without completely replacing them. Think of it as a way to make targeted adjustments—perhaps updating how an event is handled or changing a callback function—while keeping the rest of the handler's configuration intact. It's handy for things like updating event processing logic, adapting to different environments (like development versus production), or dynamically switching between different implementations of a handler. To use it, you provide a partial configuration object representing the changes you want to make.

## Function listenWalkerProgress

This function lets you track the progress of a backtest as it runs. It provides updates after each strategy within the backtest completes. 

The updates are delivered as `ProgressWalkerContract` events. 

Importantly, any code you put inside your callback function will run one after another, even if that code itself takes some time to complete, ensuring a predictable flow of information. To stop listening for these progress events, the function returns a cleanup function that you can call.

## Function listenWalkerOnce

The `listenWalkerOnce` function lets you listen for specific events happening within a trading simulation, but only once a certain condition is met. Think of it as setting up a temporary alert. You provide a filter—a rule that defines what kind of event you're looking for—and a callback function. When an event matches your filter, the callback runs just one time, then the alert automatically turns off. It's perfect for situations where you need to react to a particular state change during a backtest and don’t want to keep monitoring afterwards.

The first argument is the filter, which determines which events trigger your response. The second is the function that gets executed when the filter condition is met. Once executed, the listener is removed automatically.

## Function listenWalkerComplete

This function lets you be notified when a backtest run finishes. It’s like setting up an alert that triggers when all the strategies in your backtest have been evaluated. The notification happens in a safe and orderly way – even if your response to the notification involves some asynchronous operations, those operations will be handled one at a time, ensuring things don’t get messed up. You provide a function that will be called when the backtest is done, and this function returns another function to unsubscribe from the event.

## Function listenWalker

The `listenWalker` function lets you keep an eye on how a backtest is progressing. It's like setting up a listener that gets notified after each strategy finishes running during a backtest. 

These notifications happen one after another, even if the function you provide to handle them takes some time to complete. 

Think of it as a safe and orderly way to get updates on the backtest's performance – it ensures your code doesn’t try to process these events at the same time, preventing any potential issues. You give it a function that will be called with information about the completed strategy, and it returns a function you can use to unsubscribe from these updates later.

## Function listenValidation

This function lets you keep an eye on potential problems when your system is checking for risks. It listens for errors that happen during these checks and alerts you. 

Think of it as a safety net; whenever a validation check fails, it triggers your provided function. The important thing is that these alerts are handled one at a time, even if your handling function takes some time to process, to prevent any unexpected issues. You can use this to track down bugs or just make sure everything is running smoothly. It takes a function that will be called when an error occurs, and returns a function you can call to stop listening.


## Function listenSyncOnce

This function lets you listen for specific signal synchronization events and execute a callback function just once when they occur. It's particularly helpful when you need to coordinate your trading logic with external systems or processes. The callback will only run once for a matching event, and if that callback returns a promise, the whole process will pause until that promise resolves. You provide a filter function to specify which events you’re interested in, and a callback to handle those events.

## Function listenSync

The `listenSync` function lets you react to signals that are being synchronized, like when a trade is about to open or close. It's especially handy if you need to coordinate your trading logic with other systems that might take some time to respond.

When you use this function, it calls a provided function for each synchronization event. If that function returns a promise, the backtest kit will pause processing the signal until that promise resolves. This makes sure everything lines up correctly.

The `warned` parameter is currently unused.

## Function listenStrategyCommitOnce

This function lets you react to specific actions related to your trading strategies, but only once. It's like setting up a temporary alert – you define what kind of event you're waiting for, and when it happens, your provided code runs and then the alert automatically disappears. This is really handy if you need to do something immediately after a particular strategy change or setup completes, without needing to manage ongoing subscriptions. You tell it what event to look for, and what to do when it finds it, and it handles the rest.

## Function listenStrategyCommit

This function lets you keep an eye on what's happening with your trading strategies. It's like setting up a notification system that alerts you whenever certain actions are taken, such as a scheduled signal being cancelled, a trade being closed, or adjustments to stop-loss and take-profit levels. The notifications happen one at a time, even if your notification handling code takes some time to process. You provide a function that will be called whenever one of these events occurs, giving you a chance to react or log the information. The function you provide will be returned and can be called to unsubscribe.

## Function listenSignalOnce

This function lets you react to specific signals from your trading strategy, but only once. Think of it as setting up a temporary listener – it waits for a condition you define (using the `filterFn`), executes a function you provide (`fn`) when that condition is met, and then automatically stops listening. It's perfect for situations where you need to perform a single action based on a specific signal. You provide a function that determines if an event is relevant, and another function that gets run when a matching event arrives. Once that one event is processed, the listener disappears.

## Function listenSignalLiveOnce

This function lets you temporarily listen for specific signals coming from a live trading simulation. 

It's designed to react to a signal just once, then automatically stop listening.

You tell it what kind of signal you're looking for using a filter function – essentially, a rule that determines whether the signal is interesting to you.  Then, you provide a function that will be executed when a matching signal arrives. After that function runs, the listener stops. This is useful for things like getting a single alert or performing a one-off action based on a live signal.


## Function listenSignalLive

The `listenSignalLive` function lets you hook into a live trading simulation to receive updates as they happen. It’s designed to process these updates one at a time, ensuring things are handled in the order they arrive.

You provide a function – `fn` – that gets called whenever a new signal event occurs during a live run of your trading strategy.  This function receives data related to that event, letting you react to it in real-time.

Keep in mind this function only works with events generated by the `Live.run()` function. The function returns an unsubscribe function that you can use to stop listening.


## Function listenSignalBacktestOnce

This function lets you temporarily hook into the backtesting process and react to specific events that happen during a simulation. It's designed for one-time actions – you set up a filter to catch the events you're interested in, provide a function to handle them, and then the function automatically stops listening after that one execution. Think of it as a brief, targeted listener for a particular moment within your backtest. You'll only receive events generated by `Backtest.run()`.


## Function listenSignalBacktest

This function lets you tap into the flow of a backtest to receive updates as they happen. Think of it as setting up a listener that gets notified whenever a signal is generated during the backtest process. 

It’s especially useful if you're working with `Backtest.run()` and need to react to the results in real-time.

The updates are delivered one by one, ensuring they're processed in the order they occurred. You provide a function that gets called with each signal event, letting you do whatever you need with that information. When you’re finished listening, the function returns another function that you can call to unsubscribe, cleanly stopping the updates.


## Function listenSignal

The `listenSignal` function lets you tap into the stream of events happening during a backtest. It's designed to keep things orderly—whenever a signal is generated (like a trade opening, closing, or being active), your provided function will be called.

Crucially, these events are processed one at a time, even if your function takes a little time to run. This prevents multiple events from being handled simultaneously, which can be important for ensuring consistent results. To subscribe, just provide a function that will receive information about each signal event. When you’re finished listening, the function returns another function that you can call to unsubscribe.


## Function listenSchedulePingOnce

This function allows you to react to specific ping events within your backtest, but only once. It sets up a listener that watches for ping events that meet a certain criteria you define. Once an event matching your criteria arrives, the provided callback function will be executed, and then the listener automatically stops, preventing further executions. Think of it as a way to wait for a particular condition related to a ping event and then do something specific once it's met. You provide a filter to identify the events you’re interested in, and a function to handle them.

## Function listenSchedulePing

The `listenSchedulePing` function lets you keep an eye on scheduled signals as they wait to become active. It sends out a "ping" signal every minute while a signal is being monitored, giving you a way to track its progress and build custom monitoring actions. You provide a function that will be called with each ping event, allowing you to react to these signals in real-time. This is useful for knowing exactly when a scheduled signal is being prepared for activation. The function returns another function that, when called, will unsubscribe from these ping events.

## Function listenRiskOnce

This function lets you set up a temporary listener for risk rejection events. It's like saying, "Hey, I only care about this specific type of risk event, and I need to react to it just once." 

Once the event you're looking for happens, the callback you provide gets executed, and the listener automatically turns itself off. 

You give it a filter – a way to identify the specific risk events you're interested in – and then a function that will run when that event is detected. This is helpful when you need to respond to a particular risk scenario and then move on.


## Function listenRisk

The `listenRisk` function lets you monitor when trading signals are blocked because of risk checks. 

It's designed to only notify you when a signal is rejected, not when it's approved, so you won't be bombarded with unnecessary updates.

Think of it as a way to react specifically to situations where your trading strategy is prevented from executing due to risk limitations. 

The events are handled in a specific order and in a controlled way to prevent multiple callbacks from happening at once. You provide a function that will be called when a risk rejection occurs.

## Function listenPerformance

The `listenPerformance` function lets you monitor how quickly different parts of your trading strategy are running. It's like setting up a detective to watch your strategy and report on its timing. 

Whenever your strategy performs an action, it can send out a performance report. You provide a function (`fn`) that will receive these reports.

The reports are handled in order, one after the other, even if your reporting function takes some time to process them – this prevents things from getting out of sync.  It’s a neat way to find out where your strategy might be slow or inefficient.

## Function listenPartialProfitAvailableOnce

This function lets you set up a listener that reacts to specific partial profit events, but only once. You provide a filter—essentially, a condition—to define what kind of profit event you're interested in. When that condition is met, a function you specify will run, and then the listener automatically stops listening. It’s a handy way to react to a particular profit target being hit and then move on. 

You tell it which events to look for using a filter function. 
Then you define what should happen when a matching event occurs.


## Function listenPartialProfitAvailable

This function lets you listen for when your trading strategy hits certain profit milestones, like 10%, 20%, or 30% profit. 

It's designed to handle these events in a reliable way – even if the code you provide to respond to these events takes some time to run. 

Think of it as a way to be notified of progress without worrying about things getting jumbled up if your response is slow. You provide a function that gets called when a milestone is reached, and this function automatically makes sure that callbacks are processed one at a time.


## Function listenPartialLossAvailableOnce

This function lets you set up a one-time alert for specific changes in partial loss levels. You provide a condition – a filter – that defines what kind of loss event you're interested in. When an event matching your condition occurs, a function you provide will run once, and then the alert will automatically turn itself off. Think of it as a way to react to a particular loss condition and then forget about it.


## Function listenPartialLossAvailable

The `listenPartialLossAvailable` function lets you keep track of how much of a trading strategy's capital has been lost. It's like setting up an alert system that notifies you when the loss reaches specific points, such as 10%, 20%, or 30% of the initial capital. 

The system guarantees that these notifications are processed one at a time, in the order they occur, even if your notification handler needs to do some asynchronous work. This ensures that you get consistent and reliable updates on the loss situation. To use it, you provide a function that will be called each time a loss milestone is reached, and the function returns another function to unsubscribe.


## Function listenMaxDrawdownOnce

This function lets you set up a listener that reacts to specific max drawdown events, but only once. Think of it as a temporary alert – you define the conditions you're looking for (using `filterFn`), and when those conditions are met, a function (`fn`) is executed. After that one execution, the listener automatically stops listening. It’s a simple way to respond to a particular drawdown situation without needing to manage ongoing subscriptions. You specify what events you want to watch for with `filterFn` and what action to take when that event occurs with `fn`.

## Function listenMaxDrawdown

This function lets you keep an eye on when your backtest reaches new maximum drawdown levels. Think of it as a way to be notified whenever your strategy hits a new "low point" in terms of losses. 

It's designed to handle these notifications in a reliable order, even if the notification process takes some time. This ensures that your actions based on the drawdown events happen consistently. 

You can use this to monitor how your strategy is performing and potentially adjust things like risk levels as needed. It provides a way to react to drawdown changes without worrying about timing issues.

To use it, you provide a function that will be called whenever a new maximum drawdown is detected. This function will receive information about the drawdown event. When you're done listening, the function returns another function that you can call to unsubscribe.


## Function listenHighestProfitOnce

This function lets you set up a temporary listener that triggers only once when a specific trading event (a "HighestProfitContract") meets certain criteria you define. Think of it as a short-term alert – you specify what conditions you’re looking for, and when those conditions are met, the function executes your code once, then stops listening. 

You provide two things: a filter that determines which events you’re interested in, and a function that will be run when a matching event occurs. This is great for reacting to a particular market situation just once, like triggering an order when a new profit record is achieved. Once that single event is processed, the listener automatically disappears.


## Function listenHighestProfit

This function lets you monitor when a trading strategy hits a new peak profit level. It’s like setting up a notification system that tells you when things are going really well.

The system ensures that these notifications are handled one at a time, even if the notification process itself takes some time.

You provide a function that will be called whenever a new highest profit is achieved, and this function can do whatever you need it to, like logging the event or triggering other actions. This is particularly helpful for keeping track of how your strategy performs and for adjusting it on the fly.


## Function listenExit

The `listenExit` function allows you to be notified when a critical error occurs that will halt the entire process, such as when running background tasks in a live environment or during a backtest.  It's different from handling regular errors; these are the kinds of problems that cause the program to stop.  The provided callback function will be executed whenever such a fatal error happens, and importantly, these callbacks are handled one at a time to avoid issues from multiple errors happening at once.  You can unsubscribe from these exit notifications whenever you no longer need them.

## Function listenError

This function allows you to be notified when errors occur during your trading strategy's execution, but these aren't errors that stop the whole process. Think of it as catching hiccups – the strategy keeps running even if something goes wrong.

The function takes a callback function that will be called whenever such an error happens.

It ensures that these errors are handled one at a time, in the order they appear, even if the handling function takes some time to complete. It’s designed to keep things stable and prevent unexpected behavior due to simultaneous error processing. 

The function returns a cleanup function that you can use to unsubscribe from these error notifications when you no longer need them.

## Function listenDoneWalkerOnce

This function lets you react to when a background process within your backtest completes, but only once. You provide a filter to specify which completion events you're interested in, and a callback function that will run when a matching event occurs. After the callback runs once, the subscription is automatically removed, so you don't need to worry about cleaning up. Think of it as a quick, one-off way to monitor a specific background task's finish.


## Function listenDoneWalker

This function lets you listen for when background processes within the trading framework finish running. Think of it as a way to be notified when a longer task, started with `Walker.background()`, is complete. 

The key here is that notifications happen one at a time, even if your callback function takes some time to execute. This ensures that events aren’t missed or processed out of order. 

You provide a callback function – this is the code that will run when a background process finishes.  The function returns another function that you can call to unsubscribe from these notifications, effectively stopping the listener.


## Function listenDoneLiveOnce

This function lets you react to when background tasks finish running within your backtest.

You provide a filter to specify which completion events you're interested in – this helps you focus on specific task outcomes.

It then calls a function you provide just once when a matching event happens, and importantly, it automatically stops listening after that single call, preventing unwanted repeated actions. Think of it as setting up a temporary listener that cleans up after itself.

## Function listenDoneLive

This function lets you monitor when background tasks initiated by Live.background() finish running. It's like setting up a notification system for these tasks. 

When a background task completes, it will trigger a callback function you provide.  

Crucially, these completion notifications are handled one at a time, ensuring that your code processes them sequentially and avoids potential conflicts from running them at the same time. This is especially important if your callback function itself performs asynchronous operations.


## Function listenDoneBacktestOnce

This function lets you react to when a background backtest finishes, but only once. 

You provide a filter – a way to specify *which* backtest completions you're interested in. Then, you give it a function that will run when a matching backtest finishes.  It’s designed to be simple: it handles automatically removing itself from listening after the callback runs just one time. This is great for tasks like logging a summary or triggering a subsequent process only after a specific backtest concludes.

## Function listenDoneBacktest

This function lets you be notified when a background backtest finishes running. 

Essentially, you provide a function that will be called once the backtest is complete.

The system ensures that your function runs one after another, even if it takes time to finish (like if it involves asynchronous operations). This prevents things from getting tangled up and ensures a smooth process. You get a `DoneContract` object with information about the completed backtest.

## Function listenBreakevenAvailableOnce

This function helps you react to a specific breakeven event and then stop listening. 

It lets you define a condition (using `filterFn`) – for instance, waiting for a breakeven to reach a certain level. Once that condition is met, it will run your provided function (`fn`) just once, and then automatically stop listening for further breakeven events. This is handy when you only need to respond to a particular breakeven situation and don't want to keep monitoring afterward.

You provide a function that checks if an event is relevant, and another function that does something when that relevant event happens. The function will then automatically unsubscribe after that single event is processed.


## Function listenBreakevenAvailable

This function lets you be notified whenever a trade's stop-loss is automatically adjusted to the entry price – essentially, when the profit covers all transaction costs. It's like a safety net that protects your initial investment.

The system handles these notifications in a specific order, even if your callback function takes some time to complete. It prevents multiple notifications from running at the same time.

You provide a function that will be called whenever a breakeven event occurs, and this function receives information about the trade that triggered the event. The function you provide will return a function that you can use to unsubscribe from these notifications later.

## Function listenBacktestProgress

This function lets you keep an eye on how a backtest is running. It sends updates as the backtest runs, allowing you to track its progress. These updates will arrive in the order they happen, even if your code needs a little time to process each one. The updates are handled carefully to prevent any issues from running things at the same time. You give it a function that will be called for each progress update, and it returns another function you can call to stop listening.


## Function listenActivePingOnce

This function allows you to set up a temporary listener for active ping events. It’s like saying, "Hey, I need to react to an active ping that meets a certain condition, but only once."

You provide a filter—a way to identify the specific ping events you’re interested in—and a function to run when that event occurs.

Once the function has executed once, it automatically stops listening, so you don't need to worry about cleaning up the subscription manually. This is helpful for things like waiting for a particular type of market signal before initiating a trade.

The function returns a cleanup function, in case you need to stop the listener manually.


## Function listenActivePing

This function lets you keep an eye on active signals, receiving updates roughly every minute. It's a way to monitor the status of signals and potentially adjust your strategies based on their lifecycle.

When you subscribe using this function, the updates are handled one at a time, even if your code takes some time to process each one. This helps prevent things from getting out of sync and ensures a reliable flow of information.

You provide a function that gets called for each active ping event – this function will receive details about the signal. The function you provide will also be used to unsubscribe.

## Function listWalkerSchema

This function gives you a peek behind the scenes, letting you see all the different strategies or "walkers" that have been set up within the backtest-kit framework. It essentially pulls together a list of these registered walkers, making it easy to understand what's available or to help build tools that dynamically interact with them. Think of it as a way to inventory all your trading strategies. It's particularly handy if you're trying to understand how things are configured or if you're building a user interface that needs to display and manage these walkers.

## Function listStrategySchema

This function lets you see a full list of all the trading strategies currently set up in your backtest. 

Think of it as a way to peek under the hood and understand what strategies are available for testing. 

It's handy for things like figuring out if your strategies are loaded correctly, creating documentation, or building a user interface that lets you choose which strategies to run. The function returns a list of strategy schemas, giving you information about each one.

## Function listSizingSchema

This function lets you see all the sizing strategies that are currently active within the backtest kit. It essentially gives you a list of all the ways the framework knows how to determine position sizes for your trades. This is helpful if you're trying to understand how your backtest is configured, documenting your setup, or even creating tools that dynamically adjust based on these sizing rules. It returns a promise that resolves to an array of sizing schema objects.

## Function listRiskSchema

This function gives you a way to see all the risk configurations that are currently set up in your backtest. It returns a list of these configurations, which can be helpful if you're trying to understand how your backtest is structured, create documentation, or build a user interface to manage these settings. Think of it as a way to peek under the hood and see all the risk profiles you've added.

## Function listMemory

This function helps you see all the stored memory entries associated with a specific signal. 

It automatically figures out whether you’re in a backtest or live trading environment. 

It finds the symbol being traded and the signal ID to use, and if no signal is active, it will let you know with a warning. 

You'll get back a list of objects, each containing a unique ID and the content of the memory entry. This allows you to review and understand the data being stored.

## Function listFrameSchema

This function lets you peek at all the different frame structures your backtest is using. It's a way to see a complete list of all the frame schemas that have been registered within your trading strategy. You can use this to help with understanding your setup, making sure everything's configured correctly, or even creating tools that automatically display information about your frames. Basically, it's like getting a directory of all your frame types.

## Function listExchangeSchema

This function gives you a way to see all the exchanges that your backtest-kit setup knows about. Think of it as a quick inventory of where your trading strategies can connect. It returns a list of schemas, each describing an exchange, so you can examine them for troubleshooting or to understand what trading environments are available. It's especially handy if you're building user interfaces that need to adapt to different exchanges.

## Function hasTradeContext

This function simply tells you whether a trading context is currently active. Think of it as a quick check to see if you're in a state where you can safely use functions that interact with the exchange, like retrieving candle data or formatting prices. It confirms that both the execution and method contexts are set up correctly, which is essential before you try to perform any trading-related actions. If it returns `true`, you’re good to go!

## Function hasNoScheduledSignal

This function helps you check if there's currently no signal scheduled for a specific trading symbol. It’s essentially the opposite of `hasScheduledSignal`, so you can use it to make sure you only generate signals when they're actually needed. The function figures out whether you're in backtesting mode or live trading mode automatically, so you don’t need to worry about that.

It takes the trading symbol as input and returns a boolean value – `true` if no signal is scheduled, `false` otherwise.


## Function hasNoPendingSignal

This function helps you quickly check if a trading signal is currently waiting to be executed for a specific asset, like BTC-USD. It returns `true` if there isn't a pending signal – essentially, it's the opposite of `hasPendingSignal`.  Think of it as a safety check; you can use it before generating new signals to ensure you're not creating unnecessary orders. It automatically figures out whether you're in a backtesting or live trading environment, so you don't need to worry about that.

You just need to provide the symbol of the asset you're interested in, like "BTC-USD."


## Function getWalkerSchema

The `getWalkerSchema` function helps you access details about a specific trading strategy, or "walker," that's been set up in your backtest kit. Think of it as looking up the blueprint for a particular trading approach. You provide the name of the walker you’re interested in, and the function returns a structured description of its components and configuration. This information is useful for understanding how a walker operates and what parameters influence its behavior.


## Function getTotalPercentClosed

This function, `getTotalPercentClosed`, tells you what percentage of your position for a specific trading pair is still open. Think of it as a quick way to see how much of your initial investment is still actively being held. A value of 100 means the entire position hasn't been closed, while 0 means it's completely closed out. It handles situations where you've added to your position over time through dollar-cost averaging, correctly calculating the percentage even if you’ve closed it partially. It figures out whether it's running in a backtesting environment or a live trading situation on its own.

You just need to provide the symbol, like "BTCUSDT", to get the result.


## Function getTotalCostClosed

`getTotalCostClosed` helps you figure out how much you've spent on a particular trade, like BTC/USDT. It calculates the total cost in dollars for any open position you have, taking into account any times you've added to the position through dollar-cost averaging (DCA). It automatically knows whether you're running a backtest or a live trade, so you don't need to tell it.

You just need to tell it which trading pair you’re interested in, like "BTC/USDT".

It gives you a number representing the total cost.


## Function getTimestamp

The `getTimestamp` function gives you the current time. 

It's really useful for knowing exactly when events are happening during your trading simulations or when you're live trading. 

When you're testing your strategy (backtesting), it returns the timestamp of the specific time period your strategy is currently analyzing. However, when you're actually trading, it returns the current, real-time timestamp.

## Function getSymbol

This function retrieves the symbol you're currently trading within your backtest or simulation. Think of it as asking, "What asset am I working with right now?" It returns a promise that resolves to a string representing that symbol.

## Function getStrategySchema

The `getStrategySchema` function is your way to find the blueprint for a specific trading strategy you've registered within the backtest-kit framework. It takes the strategy's unique name as input. 

Essentially, it fetches the detailed schema defining that strategy, outlining things like the required inputs, outputs, and overall structure. This helps ensure your strategy aligns with the system's expectations.


## Function getSizingSchema

This function helps you find the specific rules for how much to trade based on a given name. Think of it as looking up a pre-defined plan for position sizing. You provide the name of the sizing method you want to use, and it returns the detailed configuration for that method. It's a quick way to access the logic behind your trade sizing strategy.


## Function getScheduledSignal

This function lets you check if a scheduled signal is currently running for a specific trading pair. It's useful when you want to see if your strategy is operating based on a predetermined plan. 

Essentially, it retrieves the signal details, or returns nothing if no signal is active. It figures out whether you’re in a backtesting or live trading environment on its own, so you don’t have to worry about that.

You just need to provide the symbol of the trading pair you're interested in.


## Function getRiskSchema

This function lets you fetch details about a specific risk being managed within the backtest kit. Think of it like looking up the blueprint for how a particular risk is handled. You provide the unique name of the risk you're interested in, and it gives you back a set of instructions – the risk schema – outlining things like how it’s measured and controlled. Essentially, it's a way to access the configuration for different risk types.

## Function getRawCandles

This function helps you retrieve historical candlestick data for a specific trading pair and timeframe. You can request a limited number of candles, or specify a start and end date to pull a range of data. The function is designed to ensure fairness in backtesting by preventing the look-ahead bias, meaning it only uses data that would have been available at the time.

You can control the date range and number of candles retrieved in several ways, offering flexibility depending on your needs. If you provide both a start and end date, the function calculates how many candles are needed based on that range. If you only specify an end date and a limit, the function will calculate the start date automatically. If only a limit is provided, it uses a default starting point based on the execution context.

Here's a breakdown of what you can provide:

*   Trading pair symbol (like "BTCUSDT") and the candlestick interval (e.g., 1-minute, 5-minute, hourly) are required.
*   You can optionally provide the number of candles you want to retrieve.
*   You can also specify a start and end date (in milliseconds) to get candles within a particular time period.


## Function getPositionPnlPercent

getPositionPnlPercent lets you check how your open positions are performing in terms of unrealized profit or loss, expressed as a percentage. It considers factors like partial order fills, dollar-cost averaging, and even slippage and fees to give you a realistic picture. If you don’t have any active signals, it will return null. The function handles the details of determining whether you're in a backtest or live trading environment and also retrieves the current market price for you. You just need to provide the symbol of the trading pair you're interested in, like 'BTCUSDT'.

## Function getPositionPnlCost

This function helps you figure out the unrealized profit or loss, in dollar terms, for a trading position you currently hold based on a signal. 

It considers things like how much you've invested, any partial closes of your position, the average price you bought in at, and even typical factors like slippage and fees.

If you don’t have an open position related to a signal, the function will return null. 

It handles whether you’re running a backtest or a live trade automatically and gets the current market price for you too. To use it, you simply provide the symbol of the trading pair you're interested in, like "BTC-USDT".


## Function getPositionPartials

This function helps you understand how your trading strategy has been partially closing positions. It fetches a record of any partial profit or loss closures you've triggered, like when you use the `commitPartialProfit` or `commitPartialLoss` functions.

If you haven't initiated a trading strategy yet, it will return null. If a strategy is running but hasn't performed any partial closures, you'll receive an empty list.

Each entry in the returned list provides details about a partial closure: the type (profit or loss), the percentage of the position closed, the price at which the closure happened, the cost basis at that point, and the number of entries included in that partial closure. You provide the symbol of the trading pair to get this information.

## Function getPositionPartialOverlap

This function helps you avoid accidentally closing parts of your positions too many times at roughly the same price.

It checks if the current market price falls within a small range around any previously executed partial close prices.

Think of it as a safety net to ensure you’re not triggering multiple partial closes when the price is hovering around the same level.

You provide the trading symbol and the current price, and optionally a configuration for the tolerance range.

It returns `true` if the current price falls within that tolerance zone of a previous partial close, and `false` otherwise (meaning it's likely safe to proceed with another potential close).


## Function getPositionMaxDrawdownTimestamp

This function helps you understand the history of a specific trading position. It tells you exactly when the position experienced its lowest point, marking the maximum drawdown. Think of it as identifying the precise moment when things got toughest for that trade. 

The function requires you to specify the trading pair symbol you are interested in.

If there's no existing trading signal for the position, it will return null, meaning there's no drawdown history to report.

## Function getPositionMaxDrawdownPrice

This function helps you understand the risk associated with a specific trading position. It tells you the lowest price a position reached during its existence, essentially showing you the maximum drawdown experienced.

Think of it as revealing the biggest loss the position has seen from its highest point.

To use it, you provide the symbol of the trading pair (like "BTC-USDT") and it will return a number representing that maximum drawdown price. If no signal is currently active for that position, it will return null.


## Function getPositionMaxDrawdownPnlPercentage

This function helps you understand the risk associated with a specific trading position. It calculates the maximum percentage loss (drawdown) experienced by a position, based on its profit and loss (PnL). 

Essentially, it tells you the lowest point the position reached in terms of profitability since it began.

If there are no trading signals currently active, the function will return null, indicating that drawdown information isn't available.

You provide the trading symbol, like "BTC/USD", to get the drawdown information for that particular pair.

## Function getPositionMaxDrawdownPnlCost

This function helps you understand the financial impact of your trading decisions. Specifically, it calculates the total loss in quote currency experienced at the point when your position reached its lowest value. 

It focuses on a single trading pair, identified by its symbol.

If there's no active trading signal for that pair, the function won't return a value.


## Function getPositionMaxDrawdownMinutes

getPositionMaxDrawdownMinutes lets you check how long ago a trade experienced its biggest loss. It tells you the number of minutes passed since the lowest point in the trade's price movement. Think of it as a way to see how much time has passed since the trade hit rock bottom.

If a trade isn't currently active, you won't get a number back, but rather a null value.  

You need to specify the trading pair, like 'BTC-USD', to get the drawdown time for that specific trade.

## Function getPositionLevels

`getPositionLevels` helps you find out the prices at which your trading strategy has entered into a position. It specifically shows the prices used for a DCA (Dollar-Cost Averaging) strategy, if one is in progress.

You'll get an array of prices; the very first price represents the initial entry price.  Any other prices in the array were added later through commits using `commitAverageBuy`.

If there's no open signal, it means no position is pending, and `getPositionLevels` will return null. If you only made one entry, it'll give you an array containing only the initial entry price. To use this function, you need to provide the symbol, like "BTCUSDT."


## Function getPositionInvestedCount

getPositionInvestedCount tells you how many times you've added to a specific trade. 

Essentially, it counts up the number of DCA (Dollar Cost Averaging) steps taken for a trade that's still in progress.

A value of 1 means it's the initial trade; higher numbers represent subsequent DCA buys.

If there’s no active trade currently being worked on, the function will return null.

You don’t need to worry about whether you’re in backtest mode or live trading – it automatically figures that out. 

You just provide the trading pair's symbol, like 'BTCUSDT', and it does the rest.

## Function getPositionInvestedCost

This function lets you find out how much money you've invested in a particular trading pair, like BTC-USDT. 

It calculates the total cost based on all your previous buy orders for that pair. This cost is initially set when you commit an average buy order.

If you haven’t placed any buy orders yet, the function will return null.

It works seamlessly whether you're running a backtest or a live trade, automatically knowing which mode it's in. You just need to give it the symbol of the trading pair you're interested in.

## Function getPositionHighestProfitTimestamp

This function helps you find out exactly when a specific trading position achieved its highest profit. It looks at a position’s history and tells you the timestamp – the date and time – when it made the most money. 

If there's no active signal for the position you're asking about, the function will return null, meaning it can't find a profitable point to report. You need to provide the trading pair symbol (like BTCUSDT) to tell the function which position you're interested in.


## Function getPositionHighestProfitPrice

getPositionHighestProfitPrice helps you find the peak profit level your trade has reached so far. 

Think of it as a record-keeper for your trades; it starts by noting the initial entry price. 

As the market moves, it constantly updates itself, tracking the highest price for long positions and the lowest price for short positions, relative to that starting point.

This function provides valuable insight into how well your trade has performed.

It needs the trading pair symbol to work—just tell it which asset you're looking at. It will always provide a value, even if the trade just started, representing the entry price.

## Function getPositionHighestProfitMinutes

This function tells you how long ago your current trading position reached its highest profit. It essentially measures the time since your position's peak profit level.

Think of it as a way to see how far your position has fallen from its best performance.

If your position just hit its highest profit, the value will be zero.

It requires a signal to exist for the trading pair you’re looking at; otherwise, it will return null. You specify the trading pair, like "BTCUSDT," as input.


## Function getPositionHighestProfitBreakeven

This function helps you understand if a trade could have realistically reached its peak profit point. 

It checks if the breakeven price, the point where you'd stop losing money, was attainable at the highest price the trade reached.

Essentially, it's verifying the feasibility of a profitable trade based on historical data.

If no signals are currently active for a particular trading pair, the function will return null.

You provide the symbol of the trading pair (like 'BTCUSDT') to analyze.


## Function getPositionHighestPnlPercentage

This function lets you find out the highest percentage profit a specific trading pair ever achieved during its lifespan. It looks back at a position's entire history to determine the peak profitability. 

If there's no trading signal currently active for that symbol, the function will return null, indicating that the information isn't available. You just need to provide the trading pair symbol to get the result.


## Function getPositionHighestPnlCost

This function helps you understand the financial impact of a specific trading position. It calculates and returns the highest profit and loss cost, expressed in the quote currency, that occurred during the position's existence – essentially, the cost at the point when the position achieved its best profit. If there are no pending signals associated with the position, the function will return null, indicating no data is available. To use it, you provide the trading pair's symbol, like 'BTC-USD', and it will give you that crucial cost figure.


## Function getPositionEstimateMinutes

getPositionEstimateMinutes helps you find out how long a trading position is expected to last. It looks at the current signal and tells you the originally estimated duration in minutes. 

Think of it as checking the planned lifespan of an open position.

If there isn’t a signal currently active, the function will return null. 

You provide the trading pair symbol (like "BTC-USD") to get the estimate for that specific symbol.

## Function getPositionEntryOverlap

This function helps you avoid accidentally entering the same DCA level multiple times. It checks if the current price falls within a small range around your existing DCA entry levels.

Essentially, it’s a safety net to ensure you're not placing duplicate orders when the price fluctuates slightly.

It takes the trading symbol and the current price as input, and optionally a configuration for the tolerance range.

If the price is within the acceptable range of an existing level, it returns `true`. Otherwise, or if there are no existing levels, it returns `false`.


## Function getPositionEntries

This function lets you see how a position was built up, step by step. It gives you a list of prices and costs for each time the position was adjusted, whether it was the initial buy or a later DCA (Dollar Cost Averaging) purchase.

If there's no active position being built, the function will return nothing.

If there was only the initial buy, you'll get a list containing just one entry.

Each entry shows the price at which the trade happened and the amount of money spent on that trade. You tell the function which trading pair (like BTC/USD) you're interested in, and it will return the position entries related to that pair.

## Function getPositionEffectivePrice

This function helps you understand the average price at which you've acquired a position in a trading pair. It calculates a weighted average, considering any prior price changes and partial trades.

Essentially, it gives you a sense of your "cost basis" for the current trade.

If you haven’t started a new trade, it will return the opening price.

If no trade is in progress, the function returns null.  You simply provide the trading pair symbol as input.


## Function getPositionDrawdownMinutes

This function helps you understand how far a trading position has fallen from its best performance. 

It calculates the time, in minutes, since the price reached its highest point for that trade. 

Think of it as a measure of how long a position has been losing ground after an initial gain. The value starts at zero when a position first becomes profitable, and increases as the price moves away from that peak. If there's no open trade for the specified symbol, it won't return any value. You need to provide the symbol, like "BTCUSDT," to get this information.

## Function getPositionCountdownMinutes

This function helps you figure out how much time is left until a trading position needs attention. It looks at when a position was flagged for review and calculates how many minutes remain based on a predetermined estimate.

The function returns the number of minutes until the position needs to be addressed, but it won't give you a negative number—it will always be zero or greater.

If no pending review signal exists for the position, the function will return null. To use it, you simply provide the trading symbol, like "BTC-USDT".

## Function getPendingSignal

This function lets you check if your strategy currently has a pending order waiting to be filled. It's useful for understanding the state of your trading logic.

If a pending signal is active, it returns information about that signal. If not, you’ll get a null value back, indicating there's nothing currently pending.

The function handles whether it's running a backtest or a live trade automatically; you don't need to specify which mode you're in.

You simply provide the trading pair symbol, like "BTCUSDT", to see the signal details.

## Function getOrderBook

This function lets you retrieve the order book for a specific trading pair, like BTCUSDT. 
It pulls this information from the exchange you're connected to. 

The function automatically handles the timing based on your current trading environment, whether you're backtesting or live trading. 

You can specify how many levels of the order book you want to see; if you don't specify a number, it will use a default depth.


## Function getNextCandles

This function helps you retrieve future candles for a specific trading pair and timeframe. Think of it as asking for the next few candles that will be available. It uses the underlying exchange's mechanism to get these candles, ensuring accuracy based on the current trading context. You’ll need to specify the symbol you’re trading (like BTCUSDT), the candle timeframe you're interested in (like 1 minute, 1 hour, etc.), and how many candles you want to retrieve.


## Function getMode

This function tells you whether the backtest-kit is currently running in backtest mode or live mode. It's a simple way to check the context of your trading logic – are you testing past data, or are you actively trading? The function returns a promise that resolves to either "backtest" or "live", allowing you to adjust your code accordingly.

## Function getFrameSchema

The `getFrameSchema` function helps you find the blueprint for a specific type of data structure used in your backtesting simulations. Think of it as looking up the definition of a particular "frame" – it tells you exactly what data it contains and how it's organized. You provide the name of the frame you're interested in, and the function returns that frame's schema, which details its structure. This is useful when you need to understand or validate the format of data within your backtest.


## Function getExchangeSchema

This function lets you get information about a specific cryptocurrency exchange that backtest-kit knows about. Think of it as looking up the details of an exchange – like its trading pairs and data formats – by its name. You provide the exchange's name, and it returns a structured description of how that exchange works within the backtest-kit environment. This is useful for understanding how backtest-kit interacts with different exchanges.


## Function getDefaultConfig

This function provides you with a set of default settings for the backtest-kit framework. Think of it as a starting point for your configurations – it gives you a comprehensive list of all the settings you *can* adjust, along with what they're set to by default. It’s useful for exploring the framework's capabilities and understanding the options available to fine-tune your backtesting process. The returned configuration is read-only, so you can’t directly modify it, but it serves as a template for building your own custom configurations.

## Function getDefaultColumns

This function provides you with a set of pre-configured columns used for generating reports. 

It essentially gives you a template of what columns can be displayed in your backtest reports, like those showing strategy results, performance metrics, and risk events. 

Think of it as a peek at the structure of the reports you can create, showing you the different data points that can be visualized and how they are organized. You can use this to understand the options you have when designing your own custom report layouts.

## Function getDate

This function, `getDate()`, provides a simple way to retrieve the current date within your trading strategies. It's useful for time-based logic regardless of whether you're running a backtest or live trading. During a backtest, it will give you the date associated with the timeframe you’re currently analyzing. When trading live, it returns the actual current date.

## Function getContext

This function retrieves information about the current method being executed within the backtest-kit framework. Think of it as a way to peek inside what's happening right now during a trading simulation. It returns a special object containing details about the current environment, which can be useful for understanding the conditions surrounding a particular trading decision.

## Function getConfig

This function lets you peek at the current settings that control how your backtests and trading systems behave. It gives you a snapshot of all the important configuration values, like how often things are checked, limits on data processing, and settings related to order execution and notifications. The returned values are a copy, so you can look at them without worrying about changing the actual running configuration. Think of it as a way to understand what’s happening under the hood.

## Function getColumns

This function gives you a peek at how your backtest data will be displayed in the markdown report. 

It returns all the column definitions used for different aspects of the backtest, such as strategy results, risk metrics, and performance data. Think of it as a snapshot of the structure used to build the report.

Importantly, the copy it provides is safe; any changes you make to it won't affect the original column configuration. It's a read-only view.


## Function getCandles

This function lets you retrieve historical price data, also known as candles, for a specific trading pair. You provide the symbol, like "BTCUSDT" for Bitcoin against USDT, and the desired time interval for the candles, such as "1h" for one-hour candles.  You also specify how many candles you want to retrieve, like the last 100 candles. The function then pulls this data from the trading platform you’ve connected to. Essentially, it's a straightforward way to get past price movements for analysis or backtesting.


## Function getBreakeven

This function helps you determine if a trade has become profitable enough to cover transaction costs. It looks at the current price of an asset and compares it to a calculated threshold, which factors in slippage and fees. Essentially, it tells you whether the price has moved sufficiently in your favor to break even on the initial trade. The function intelligently adapts to whether you're in a backtesting environment or a live trading situation. You provide the symbol of the asset being traded and the current price to check.

## Function getBacktestTimeframe

This function helps you find out the dates and times included in a backtest for a specific cryptocurrency or trading pair, like Bitcoin against USDT. 

It takes the symbol of the trading pair as input – for example, "BTCUSDT". 

The function then returns a list of dates that represent the time period being analyzed in the backtest. This is useful for understanding the scope of your backtesting simulation.

## Function getAveragePrice

This function helps you figure out the average price of a trading pair, like BTCUSDT. It calculates what's called a VWAP, which is a price that takes into account how much of the asset was traded and at what prices.

Essentially, it looks at the last five minutes of trading data, figures out a "typical price" for each minute (based on the high, low, and closing prices), and then weighs those prices by the volume traded. If there's no trading volume during that time, it just calculates a simple average of the closing prices instead. You provide the trading pair's symbol to use for the calculation.

## Function getAggregatedTrades

This function lets you retrieve a history of combined trades for a specific cryptocurrency pair, like BTCUSDT. It pulls this data directly from the exchange you've set up.

If you don't specify a limit, it'll get all trades within a reasonable time window. 

However, you *can* tell it to retrieve just the most recent 'limit' number of trades, which is useful if you only need a smaller sample. It cleverly fetches trades in chunks, ensuring you get at least the number of trades you requested.

## Function getActionSchema

This function helps you find the blueprint, or schema, for a specific action within your backtest kit. Think of it like looking up the rules for a particular trading maneuver. You give it the action's name, and it returns a detailed description of what that action involves – what data it needs, what it does, and how it works. This is useful when you want to understand or validate the structure of an action.


## Function formatQuantity

The `formatQuantity` function helps you make sure the amount you're trading looks right for a specific exchange. It takes the trading pair, like "BTCUSDT", and the raw quantity you want to trade, and then formats it correctly, ensuring it has the right number of decimal places as required by the exchange. This is useful for things like creating accurate order placements.


## Function formatPrice

This function helps you display prices correctly for different trading pairs. It takes a symbol like "BTCUSDT" and a price as input. 

It then uses the specific rules for that exchange to format the price, ensuring the right number of decimal places are shown. This prevents displaying prices that are inaccurate based on the exchange’s standards.


## Function dumpText

The `dumpText` function helps you save raw text data related to a specific trading signal. Think of it as a way to record observations or notes linked to a particular point in time. 

It automatically figures out which signal it's associated with, pulling that information from the system's current state. If there’s no active signal, it will alert you that nothing was saved.

The function takes a data package containing the bucket name, a unique ID for the dump, the actual text content, and a description. It promises to handle the saving process, and you don't need to worry about the technical details.


## Function dumpTable

This function helps you display data in a clear, organized table format. It's designed for showcasing results, like those generated during a backtest.

It automatically figures out the column names by looking at all the data you provide.

The function connects to the current trading signal, retrieving its ID to properly associate the table. If no signal is active, it will let you know and won't proceed.

You provide an array of objects (records), along with a bucket name, dump ID, a description, and the function will display them as a table.


## Function dumpRecord

This function helps you save individual data records, like a snapshot of trading activity, to a storage location. Think of it as exporting a piece of your backtest data for later analysis or debugging. It automatically knows which signal the record belongs to, pulling that information from the current backtest execution. If no signal is active, it'll let you know with a warning but won’t proceed. You provide the storage bucket name, a unique identifier for the dump, the actual record data, and a description of what the record represents.


## Function dumpJson

The `dumpJson` function lets you save complex data structures, essentially any object, as a formatted JSON block tied to a specific trading signal. Think of it as a way to record detailed information about a particular moment during a trade. It automatically figures out which signal to associate with the data – you don’t need to specify it directly. If no signal is active, it will simply skip the process and alert you that something's amiss.

The `dto` parameter contains the data you're saving and information about where to save it, including the bucket name, dump ID, the JSON object itself, and a description.


## Function dumpError

The `dumpError` function helps you report detailed error information related to a specific trading signal. It's designed to associate errors with a particular signal, making it easier to track down problems.

It automatically finds the signal it's linked to, so you don't need to specify it directly.

If no signal is found, you'll get a notification that something might be amiss, and the error won't be recorded. 

The `dto` parameter contains the information to be dumped, including the bucket name, a unique dump ID, the actual error description, and an overall description of the problem.


## Function dumpAgentAnswer

This function helps you save a complete record of a conversation with an agent, linking it to a specific trading signal. 

It automatically figures out which signal it's related to based on the current context, so you don’t need to specify that directly. 

If there's no active signal to associate with, it’ll let you know with a warning message but still proceed. The function takes an object containing the bucket name, a unique identifier for the dump, the messages exchanged, and a descriptive summary of the interaction. It then saves this data, creating a snapshot of the agent's responses.

## Function commitTrailingTakeCost

This function lets you set a specific price target for your take-profit order, acting as a direct adjustment to the trailing take-profit. It automatically calculates how to adjust the percentage shift based on the original take-profit distance. 

The function handles getting the current market price and determines whether it's running in a backtesting or live environment, so you don't have to worry about those details.

You only need to provide the trading pair's symbol and the new take-profit price you want to set. The function will take care of the rest.


## Function commitTrailingTake

This function lets you fine-tune the trailing take-profit distance for your pending trading signals. It’s designed to make sure your take-profit doesn't drift too far away from your original intention. 

Think of it as making small adjustments to your target price, expressed as a percentage of the initial take-profit you set. 

Importantly, it always calculates these adjustments based on the original take-profit distance, avoiding errors that can build up over time.

The adjustments are a bit selective – it only moves the take-profit in a direction that makes it more conservative (closer to your entry price).  For long positions, it only lowers the take-profit; for short positions, it only raises it. 

The function also takes care of whether you're running a backtest or a live trade, so you don’t have to worry about that detail.

You provide the symbol of the trading pair, the percentage shift you want to apply to the original take-profit distance, and the current market price.


## Function commitTrailingStopCost

This function lets you update the trailing stop-loss price to a specific value. It simplifies things by handling the calculations needed to convert that price into the percentage shift used internally. 

It automatically figures out whether you're in a backtest or a live trading environment and gets the current price to make the adjustment. You just need to provide the trading pair symbol and the new stop-loss price you want to set.

## Function commitTrailingStop

The `commitTrailingStop` function helps you manage your trailing stop-loss orders. It's designed to refine the distance of your stop-loss based on price movements, ensuring your protection is always as effective as possible.

The function carefully calculates adjustments relative to the *original* stop-loss distance, preventing errors from piling up over time. You specify a percentage shift to adjust this distance, with negative values tightening the stop-loss (moving it closer to your entry price) and positive values loosening it.

Importantly, the function only makes changes that improve your protection – it won’t tighten a long position’s stop-loss or loosen a short position's. This intelligent update mechanism ensures you're always getting the best possible risk management. The function intelligently determines whether it's running in backtest or live trading mode.

To use it, you'll provide the trading symbol, the percentage shift you want to apply, and the current market price.


## Function commitPartialProfitCost

The `commitPartialProfitCost` function helps you automatically close a portion of your trade when you've reached a certain profit level, measured in dollars. It simplifies the process by taking a dollar amount you want to recoup and calculating the corresponding percentage of your position to close. This function is useful for gradually securing profits as your trade moves towards your target profit level.

It handles the details of determining the current price and adapting to whether you're running a backtest or a live trade. 

You just need to specify the symbol being traded and the dollar amount you want to realize in profit. For example, `commitPartialProfitCost("BTCUSDT", 150)` will close enough of the position to realize $150 in profit.


## Function commitPartialProfit

This function lets you automatically close a portion of your open trade when the price moves in a profitable direction, helping you secure some gains along the way. It's designed to handle both backtesting and live trading environments without needing any special adjustments. To use it, you'll specify the trading symbol and the percentage of your position you want to close – for example, closing 25% of your trade. Essentially, it's a way to gradually lock in profits as your trade progresses.

## Function commitPartialLossCost

This function lets you partially close a position, taking a loss and moving closer to your stop-loss order. It's a simplified way to close a portion of your position based on a specific dollar amount. The function automatically figures out how much of your position to close based on the dollar amount you specify, and it works whether you're in a backtesting environment or a live trading situation. It also determines the current price for you, so you don't have to.

To use it, you'll need to provide the trading symbol and the dollar amount you want to use for the partial close. Keep in mind that the price must be moving in a direction that would trigger a stop-loss.


## Function commitPartialLoss

The `commitPartialLoss` function helps you automatically close a portion of your open trades when the price moves in a way that triggers a stop-loss. It lets you specify what percentage of your position you want to close when this happens. This function smartly adapts to whether you're running a backtest or a live trading environment, handling the details for you. To use it, you need to provide the symbol of the trading pair and the percentage of the position to close, expressed as a number between 0 and 100.

## Function commitClosePending

This function lets you manually close a pending order, essentially canceling a trade that’s already in progress but hasn't fully executed. Think of it as a way to quickly override a signal without interrupting your overall trading strategy. It doesn't stop the strategy from running or creating new signals, and it doesn't trigger a stop loss. You can optionally include a close ID to help you keep track of when and why you manually closed that trade. The system automatically knows whether it’s running in a backtesting environment or a live trading setup.

## Function commitCancelScheduled

This function lets you cancel a previously scheduled signal within your trading strategy without interrupting its overall operation. Think of it as removing a signal from the waiting queue – it won't affect any existing orders or stop the strategy from producing new signals.

You can optionally provide a cancellation ID to help track where the cancellation request originated. 

The function automatically adapts to whether it’s running in a backtesting or live trading environment.


## Function commitBreakeven

This function helps you automatically manage your stop-loss orders. 

It essentially moves your stop-loss to the entry price – meaning you’re no longer at risk – once the price has moved in your favor enough to cover any fees and a small slippage allowance.

The function figures out if it's running in a backtest or live environment on its own, and it gets the current price to determine if the threshold has been met. You just need to tell it which trading pair (symbol) you want it to apply to.


## Function commitAverageBuy

The `commitAverageBuy` function lets you add a new "average buy" purchase to your trading strategy. It essentially records a buy order at the current market price, keeping track of your overall average entry price. This is helpful for dollar-cost averaging, where you gradually build a position over time. The function automatically figures out if you're in a backtest or live trading environment and retrieves the current price for you. It also notifies your system about the new buy, allowing other components to react to it. You provide the symbol of the trading pair, and optionally a cost value.

## Function commitActivateScheduled

This function lets you manually trigger a scheduled signal before the price actually hits the target price. 

Think of it as an emergency button for your automated trading plans. 

It essentially tells the trading strategy, "Hey, this scheduled action needs to happen now!"

You specify the symbol you're trading and can optionally provide an ID to help you keep track of when you initiated this early activation. 

The framework will automatically handle whether it's in a backtesting or live trading environment.


## Function checkCandles

The `checkCandles` function helps ensure your trading data is properly aligned. It verifies that the timestamps of your historical candle data match the expected intervals. This function works by directly reading the data from the files where it's stored, avoiding extra layers of complexity. Think of it as a way to double-check your data’s consistency, particularly useful when dealing with potentially large datasets or ensuring accuracy. It takes a set of parameters to guide the validation process.

## Function addWalkerSchema

This function lets you register a custom "walker" – essentially a way to run and compare different trading strategies against each other using the same data. Think of it as setting up a standardized test environment where you can see how various strategies stack up.

The `walkerSchema` argument holds all the details about how this walker should operate, defining things like the strategies involved and how their performance will be measured.

By adding a walker, you’re extending the backtest-kit’s capabilities to allow for more complex and meaningful comparisons of trading approaches.

## Function addStrategySchema

This function lets you officially register a trading strategy within the backtest-kit framework. Think of it as telling the system about a new strategy you’ve built.

Once registered, the framework will automatically check your strategy's configuration to make sure everything is set up correctly, including the validity of price data, stop-loss and take-profit logic, and timestamps. It also helps prevent signals from being sent too frequently and ensures your strategy can handle unexpected interruptions safely, particularly when running live.

You provide a configuration object, called `strategySchema`, which defines the specifics of your trading strategy.

## Function addSizingSchema

This function lets you tell the backtest-kit how to determine the size of your trades. You provide a sizing schema, which is essentially a recipe that outlines how much capital to allocate to each trade based on factors like risk tolerance, volatility, and desired return. It’s how you control how aggressively or conservatively your strategy invests.

The sizing schema can use predefined methods, or you can provide your own custom calculation logic through a callback function. This allows for very flexible control over position sizing.


## Function addRiskSchema

This function lets you define and register how your trading system manages risk. Think of it as setting up the boundaries to prevent taking on too much exposure at once. 

It allows you to specify limits on the total number of positions your strategies can hold simultaneously. 

You can also implement custom checks to validate signals based on more complex factors like portfolio composition or correlations between assets. 

Finally, it provides a way to handle situations where signals are rejected or accepted based on risk conditions, using callbacks. 

Importantly, risk management is shared across all your trading strategies using this setup, which means the system can see and react to the combined impact of multiple strategies.


## Function addFrameSchema

This function lets you tell the backtest-kit about a new timeframe generator you want to use. Think of it as registering a way to create the chunks of historical data your backtest will analyze. It’s how you define the start and end dates of your backtest, the frequency of the data (like daily, weekly, or hourly), and a special function that will be called when new timeframe data becomes available. You provide a configuration object that specifies all these details, and the backtest-kit will use it to prepare the data for your trading strategy.


## Function addExchangeSchema

This function lets you tell the backtest-kit framework about a new exchange you want to use for your backtesting. Think of it as registering a data source. 

It allows the framework to understand how to fetch historical price data (candles), format prices and quantities correctly for that exchange, and calculate the Volume Weighted Average Price (VWAP) based on recent trades. 

You provide the function with an object describing the exchange's configuration, including how to access its data.

## Function addActionSchema

This function lets you tell the backtest-kit framework about a new action you want to use. Think of actions as little helpers that react to what's happening during your backtest. They can do things like update your state management tools (like Redux), send notifications to places like Discord or Telegram, keep track of important events, or even trigger custom logic based on what the strategy does. 

Each action is specifically linked to a combination of strategy and timeframe, giving it the right information when it needs to respond to events like a signal being generated or reaching a profit target. You simply provide a configuration object describing how you want this action to work, and the framework takes care of the rest.
