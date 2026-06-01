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

The `writeMemory` function lets you store data persistently within your trading strategies, associating it with a specific "bucket" and unique identifier. Think of it as creating labeled containers to hold information that your strategy needs to remember across different executions. It handles the technical details of writing this data, adjusting to whether you're in a backtesting or live trading environment, and automatically connecting the data to the current trading signal. 

You provide a name for the bucket, a unique ID for the memory slot, the actual data you want to store (which can be any object), and a descriptive label for what the data represents. The function then safely saves this information, making it available to your strategy later on. 


## Function warmCandles

This function helps speed up your backtesting by pre-loading historical candle data. Think of it as preparing the ground for your trading strategies. It downloads all the necessary candle data for a specific date range and interval, storing them in a way that makes them readily accessible later. This is particularly useful for longer backtest periods or when using higher-frequency data, as it avoids repeated downloads during the actual backtest process. You provide a set of parameters that define the start and end dates, and the interval for which you want to retrieve the candles.

## Function waitForReady

This function helps ensure your trading environment is fully set up before you begin. It waits patiently, checking key components – the exchange, frame (historical data window), and strategy – to confirm they're correctly registered.

Think of it as a readiness check at the beginning of your backtest or live trading session.

If you're doing a backtest, it makes sure all three – exchange, frame, and strategy – are ready. For live trading, it only verifies the exchange and strategy.

It polls these components once every second, up to a certain time limit. If everything isn't ready by then, it won't throw an error itself but will allow any subsequent problems to surface later, so you know exactly what went wrong.

You can tell it whether you're performing a backtest or live trading; this determines which components it checks.

## Function validate

This function helps you double-check that everything you're using in your backtests is correctly set up. It verifies that all the names you're using for things like exchanges, trading strategies, and risk management systems actually exist within the system.

You can tell it specifically which parts to check, or if you leave it blank, it will check *everything*.

Think of it as a final safety check before you start running simulations to make sure nothing is missing or misconfigured. Running this is a good idea before starting any backtests or optimizations.

## Function stopStrategy

This function lets you halt a trading strategy's signal generation for a specific trading pair. 

It essentially pauses the strategy, preventing it from creating any new trades. Existing trades will still finish normally. 

Whether you're in backtesting or live trading, the system will gracefully stop the strategy at a convenient point, like when it's idle or a signal has completed. You just need to specify the trading pair (like 'BTC-USDT') you want to pause.


## Function shutdown

The `shutdown` function provides a way to safely end the backtesting process. It signals to all parts of the system that it's time to wrap things up and clean up any resources. Think of it as a polite exit, allowing everything to finish its work before the program closes. This is especially helpful when you need to handle interruptions like pressing Ctrl+C.

## Function setSignalState

This function helps you update data related to a specific trading signal. It's designed to work when a trading signal is actively running, whether you're backtesting or live trading. It automatically handles figuring out which signal is active, and if no signal is active, it will alert you with a warning. 

Essentially, it's useful for tracking information like how long a trade has been open or how much it's gained, across multiple trades within that same signal. This is particularly helpful for strategies that want to monitor performance metrics and make decisions based on those metrics, for instance, exiting a trade if it's been open for too long and hasn't reached a certain profit level.

The function needs the trading symbol, a way to send the data, and a set of instructions for what to do.


## Function setSessionData

This function lets you store information relevant to a specific trading scenario – think of it as a temporary memory for your strategy. 

It associates a piece of data with a particular combination of trading symbol, strategy, exchange, and timeframe.

The data persists throughout a single backtest run and even survives if your process unexpectedly restarts in live trading mode, which is really handy for things like caching complex calculations or remembering intermediate results between candles.

You can clear this stored data by setting the value to null.

The function intelligently knows whether it's running a backtest or live trading, so you don't need to worry about specifying that.

It takes the trading symbol as a string and the data you want to store, which can be any object or set to null to remove the data.

## Function setLogger

This function lets you plug in your own logging system for the backtest-kit. 

You provide a logger that follows the `ILogger` interface, and all the framework’s logging messages will be routed through it.

The logger will automatically receive useful context alongside each message, such as the trading strategy name, the exchange being used, and the symbol being traded. This makes it much easier to track down issues during backtesting.

## Function setConfig

The `setConfig` function lets you adjust how the backtest-kit framework operates. You can provide a set of configuration options to modify existing settings; it doesn't require you to define the entire configuration from scratch – only the parts you want to change are necessary.  There's also a special `_unsafe` option;  if you're working in a testing environment, you might use this to bypass some checks, but be cautious when using it as it can lead to unexpected results.

## Function setColumns

This function lets you customize the columns that appear in your backtest reports, like those generated for markdown. You can essentially redefine what information is shown and how it's organized. It's useful for tailoring reports to specific needs.

The `columns` parameter lets you provide a set of configurations, allowing you to modify existing columns or add new ones. However, the framework does a thorough check of these configurations to ensure they're set up correctly.

If you're working within a testbed environment and need to bypass these validations (perhaps for testing purposes), you can use the `_unsafe` flag.

## Function searchMemory

The `searchMemory` function helps you find relevant information stored in your memory system. It’s like a powerful search engine specifically designed for your trading data.

You provide the name of the memory bucket you want to search and the keywords you're looking for. 

It uses a technique called BM25 to rank the results, ensuring that the most relevant entries appear first. 

The function intelligently figures out whether you're in a backtesting or live trading environment and uses the appropriate signal context.

The result is a list of memory entries, each with an ID, a relevance score, and the actual data content. The data content will match the structure of the data you originally stored (defined by the generic type `T`).


## Function runInMockContext

This function lets you execute a piece of code as if it were running within a backtest-kit trading environment, but without actually needing a full backtest setup. Think of it as a sandbox where you can test code that relies on things like the current time or exchange information.

It’s particularly handy for writing tests or quick scripts where you need to access these context-dependent features.

You can customize the environment by providing optional settings like the exchange name, strategy name, symbol, or whether it's a live or backtest mode. If you don't specify these, it will create a basic live-mode environment with placeholder names. The default time is set to the current minute.


## Function removeMemory

This function lets you delete a specific memory entry associated with a signal. 

Think of it as cleaning up old data – it takes the bucket name and a unique ID to identify the memory you want to remove. 

It smartly handles different environments, automatically knowing whether it's running a backtest or a live trading session.


## Function readMemory

The `readMemory` function lets you retrieve data that has been stored in memory, associating it with the specific signal currently being processed. It automatically figures out whether you’re in backtesting mode or live trading, and resolves the appropriate signal based on the execution context, simplifying your code. To use it, you provide the name of the memory bucket and the unique ID of the memory item you want to retrieve. The function will return the data as an object of the type you specify.

## Function overrideWalkerSchema

This function lets you tweak an existing "walker" configuration, which is used when comparing different strategies. Think of a walker as a set of rules for how the backtest kit analyzes your trading. It allows you to selectively update parts of the walker's setup, keeping the original configuration mostly intact while making specific changes. You provide a partial configuration—just the settings you want to change—and the function returns the updated, complete walker configuration.

## Function overrideStrategySchema

This function lets you modify a strategy's settings after it's already been defined within the backtest-kit framework. Think of it as a way to fine-tune a strategy's configuration without completely redefining it. You provide a new set of settings – just the parts you want to change – and the framework updates the existing strategy, keeping everything else as it was. This is useful for adjusting parameters or adding new options to strategies on the fly. It returns a promise that resolves to the updated strategy schema.

## Function overrideSizingSchema

This function lets you tweak an existing sizing configuration without having to rebuild it from scratch. Think of it as a way to make small adjustments to how your positions are sized. You provide a partial configuration – only the parts you want to change – and it merges those changes into the existing sizing schema. The rest of the original configuration stays exactly as it was.

## Function overrideRiskSchema

This function lets you modify a risk management setup that's already in use. Think of it as updating specific pieces of an existing plan rather than creating a whole new one. You provide a partial configuration – just the parts you want to change – and the rest of the risk management settings stay as they were before. It’s a handy way to fine-tune your risk controls without starting from scratch.


## Function overrideFrameSchema

This function lets you tweak the configuration of an existing timeframe you're using for backtesting. Think of it as a way to make small adjustments – you provide a partial update, and only the settings you specify will change; the rest of the timeframe’s configuration stays as it was. It's useful when you need to fine-tune things without completely redefining a timeframe. The function returns a promise that resolves to the updated timeframe configuration. You’ll need to provide a configuration object that details the changes you want to make.

## Function overrideExchangeSchema

This function lets you tweak an already-existing data source for an exchange within the backtest-kit framework. Think of it as a way to make small adjustments to how your data is pulled in – perhaps you want to change a specific setting without rewriting the entire data source definition. You provide a partial configuration, and only the fields you specify will be updated; everything else stays as it was originally defined. It's a handy way to customize your data feeds without a full overhaul.

## Function overrideActionSchema

This function lets you tweak how your trading actions work without having to completely redo them. Think of it as a way to make small adjustments to existing actions, like changing how a specific event is handled or modifying a callback function for different testing environments. You can use it to change the behavior of an action on the fly, even while your core trading strategy remains the same. It’s particularly useful when you need to update event handler logic or switch between different implementations of a handler, but want to avoid a full re-registration. You only provide the parts of the action configuration you want to change; everything else stays as it was.

## Function listenWalkerProgress

This function lets you keep an eye on how your backtesting strategies are progressing. It provides a way to get notified after each strategy finishes running within a Walker. 

Importantly, the notifications are delivered in the order they happen, and the function handles asynchronous callbacks to prevent things from getting out of control – it ensures things run one at a time. To stop listening, simply call the function that this returns; it unsubscribes you from the progress updates. You provide a function that will receive information about each completed strategy.

## Function listenWalkerOnce

The `listenWalkerOnce` function lets you subscribe to walker events, but with a twist: it only calls your provided function once when a matching event occurs. After that single execution, it automatically stops listening, making it perfect for situations where you need to react to a specific condition in the walker's progress and then move on. You provide a filter function to determine which events you're interested in, and then another function to execute when the filter matches. This function returns an unsubscribe function that can be used to manually stop the listener before it automatically unsubscribes.

## Function listenWalkerComplete

This function lets you be notified when a backtest run finishes, ensuring all strategies have been tested. It's designed to handle events in the order they arrive, even if your notification code takes some time to process (like making asynchronous calls). To prevent things from getting messy with multiple callbacks running at once, this system queues up your callback so it runs one after another. You provide a function that will be executed when the backtest is complete and receive information about the completion event. To stop listening, the function returns another function that you can call.

## Function listenWalker

The `listenWalker` function lets you keep an eye on how a backtest is progressing. It’s like setting up a notification system that gets triggered after each strategy finishes running within the backtest. 

You provide a function that will be called whenever a strategy completes, and this function will receive information about that strategy's result.

Importantly, the notifications are handled in a special way: they are processed one at a time, and if your notification function takes some time to run (like if it's performing asynchronous operations), the system ensures that it finishes before the next notification is sent. This helps prevent any unexpected issues caused by multiple processes running at the same time.

## Function listenValidation

This function lets you keep an eye on any problems that pop up during the risk validation process—specifically when the framework is checking signals. 

It's like setting up an alert system that triggers whenever a validation check fails and throws an error.

You provide a function (`fn`) that will be called whenever an error occurs, allowing you to log, debug, or otherwise respond to those errors. The function will be executed one at a time to prevent things from getting out of control, even if your error-handling function takes some time to complete. This ensures errors are processed in the order they were received.


## Function listenSyncOnce

The `listenSyncOnce` function lets you react to specific synchronization events just once. It's designed to make sure your trading actions – like opening or closing positions – happen in sync with external systems or processes. 

You provide a filter function to determine which events you're interested in, and a callback function that will be executed only once when a matching event occurs. If your callback function involves asynchronous operations (like promises), the entire signal processing will pause until those operations are finished, guaranteeing everything stays synchronized. There’s also a `warned` parameter you can use for internal control.

## Function listenSync

This function lets you react to events as signals are being synchronized, like when a trade is about to be opened or closed. It's particularly handy if you need to coordinate your trading system with something else, like an external data source. If the callback you provide contains asynchronous operations (like promises), the backtest kit will pause the trading process until those operations finish – ensuring everything stays in sync. You can also use the `warned` parameter, though its specific function isn't detailed here.


## Function listenStrategyCommitOnce

This function lets you temporarily "watch" for specific changes happening to your trading strategies. You provide a rule – a filter – that describes the changes you're interested in. Once a change matches your rule, a provided function is run just once to handle the event, and then the "watching" stops automatically. It’s handy when you need to react to a single, particular action related to a strategy, and then you're done. 

You tell it what kind of events to look for, and what to do when one is found. The function then quietly stops listening after that one event happens.

## Function listenStrategyCommit

This function lets you keep an eye on what’s happening with your trading strategies. It's like setting up a notification system to be alerted whenever a strategy makes changes, such as canceling a scheduled action, closing a trade, or adjusting stop-loss or take-profit levels. The notifications are delivered in order, and the system makes sure they are handled one at a time, even if the notification requires some processing. You provide a function that gets executed whenever one of these strategy events happens. To stop listening, just call the function that the `listenStrategyCommit` function returns.

## Function listenSignalOnce

This function lets you listen for specific trading signals and react to them just once. You provide a filter – essentially a rule – that determines which signals you're interested in, and a function to run when a matching signal arrives. Once that signal is processed, the function automatically stops listening, so you don’t have to worry about cleaning up the subscription yourself.

It's perfect for scenarios where you need to wait for a particular condition to be met and then take action, and you only need that action to happen once.

For example, you might use it to trigger an order when a certain price level is reached.

The filter function helps you select the precise signals you want to act upon.
The callback function contains the code to execute when the signal matches your filter.


## Function listenSignalNotifyOnce

This function helps you react to specific trading signals just once and then stop listening. Think of it as setting up a temporary alert. 

You provide a filter – a rule that defines which signals you’re interested in. Then, you give it a function that will be executed *only once* when a matching signal arrives. After that one execution, the function automatically stops listening for those signals, so you don't have to worry about cleaning up your subscriptions. It's ideal for situations where you need a one-time response to a particular market condition.


## Function listenSignalNotify

This function lets you be notified whenever a trading strategy sends out a signal note related to an open position. 

Think of it as subscribing to updates about specific events a strategy might want to communicate.

It ensures these updates are handled one at a time, even if your notification code takes some time to complete. 

You provide a function that will be called whenever a new signal note is available, and it returns a function to unsubscribe from these notifications.

## Function listenSignalLiveOnce

This function lets you temporarily listen for specific trading signals coming from a live trading execution. Think of it as setting up a one-time alert for a particular event. You define a filter to specify what kind of signal you're looking for, and then a function that will run exactly once when that signal arrives. Once that single event is processed, the listener automatically stops, so you don't need to manage the subscription yourself. This is handy for things like verifying initial conditions or reacting to a single, crucial event during a live trade. 

The filter determines which signals you’ll receive, and the callback function executes once when a matching signal appears.


## Function listenSignalLive

This function lets you tap into live trading signals generated during a backtest execution. Think of it as setting up a listener that gets notified whenever a trading signal is produced.

The listener you provide, a function that accepts a `IStrategyTickResult`, will be called for each signal, ensuring they are handled one at a time and in the order they arrive. This is specifically for signals coming from a `Live.run()` execution – it won't pick up signals from other backtest modes. To stop listening, the function returns another function which you can call to unsubscribe.

## Function listenSignalBacktestOnce

This function lets you temporarily listen for specific signals generated during a backtest run. It’s like setting up a temporary listener that only reacts to events you’re interested in, based on a filter you provide. The provided callback function will only be executed once, and then the listener automatically stops, preventing any further interference with the backtest. You specify which events trigger the callback by providing a filter function.

## Function listenSignalBacktest

This function lets you listen for updates as a backtest runs. 

It provides a way to react to events generated during the backtesting process, ensuring those events are handled one at a time.

You pass in a function that will be called whenever a backtest event occurs. This function receives data about the backtest tick, allowing you to respond to the changes happening during the simulation. 

The function returns another function that you can call to unsubscribe from the signal. This is useful for cleaning up when you no longer need to listen for backtest events. Remember that the events you receive will only come from backtests started with `Backtest.run()`.

## Function listenSignal

This function lets you listen for signals from your trading strategy – things like when a trade is opened, active, or closed. It's a simple way to react to these events in your backtest. 

Importantly, it handles the signals in the order they come in and makes sure they're processed one at a time, even if your reaction function takes some time to complete. This sequential processing helps prevent issues that can arise when multiple signals trigger simultaneously.

You provide a function that gets called whenever a signal event occurs, and that function receives information about the specific event. When you are finished listening, the function returns another function that you can call to unsubscribe.

## Function listenSchedulePingOnce

This function lets you set up a listener that reacts to specific ping events, but only once. You provide a filter to determine which events you're interested in, and a function to execute when a matching event is found. Once that event triggers the callback, the listener automatically stops, making it perfect for situations where you need to react to a single, particular event. It simplifies your code by handling the subscription and unsubscription process for you.


## Function listenSchedulePing

This function lets you keep an eye on scheduled signals as they wait to become active. It sends a "ping" event every minute while a signal is being monitored, giving you a regular update. You provide a function that will be called each time a ping event occurs, allowing you to build custom checks or track the signal's status. Essentially, it's a way to be notified about the progress of signals that haven't yet started trading. The function returns a way to unsubscribe from these pings when you no longer need them.

## Function listenRiskOnce

This function lets you set up a temporary listener for risk rejection events. It’s designed to react to a specific risk condition just once and then stop listening. You provide a filter that determines which events you’re interested in, and a function that will be executed when that event occurs. After the function runs once, the listener automatically stops, ensuring you don't continue to receive and process these events. It's handy for situations where you need to respond to a particular risk scenario only one time.

The first argument is a test—a function—that decides whether an event is relevant to you. The second argument is the action—a function—that runs when a matching event is found. The function `listenRiskOnce` returns another function, which you can call to cancel the listener before it triggers.

## Function listenRisk

The `listenRisk` function lets you be notified whenever a trading signal is blocked because it doesn't meet the defined risk criteria. It’s designed to avoid overwhelming you with notifications – you’ll only receive alerts when a signal is specifically rejected by the risk system.

These notifications are handled in the order they're received, and any processing you do within your callback function will happen one at a time to ensure things stay orderly. This helps you react to rejected signals in a controlled and reliable way.

You provide a function as an argument; this function will be called with details about the rejected signal when it occurs. When you’re finished listening for these risk rejection events, the function returns another function which you can call to unsubscribe.

## Function listenPerformance

This function lets you keep an eye on how long different parts of your trading strategy take to run. It's like setting up a listener that gets notified whenever a significant operation completes. You provide a function that will be called whenever a performance event happens, allowing you to monitor and analyze timings. Importantly, these events are processed one at a time, even if your callback function takes a while to execute, ensuring a consistent and predictable flow of information. This makes it easy to pinpoint where your strategy might be slow or inefficient.


## Function listenPartialProfitAvailableOnce

This function lets you watch for specific profit levels being reached in your trades, but only once. You tell it what conditions to look for using a filter – a function that checks each event. When the right condition is met, a callback function you provide will run just once, and then the subscription stops automatically. It's really handy if you need to react to a particular profit target being hit and then want to move on.


## Function listenPartialProfitAvailable

This function lets you monitor a trading strategy's progress towards profitability. It will notify you whenever the strategy hits predefined profit milestones like 10%, 20%, or 30% gain. 

The important thing to know is that these notifications are handled carefully to avoid problems that could arise if your response to each notification takes some time. The system ensures that each notification is processed one after another, even if your code for handling a notification needs to do some asynchronous operations.

You provide a function that will be called with details about each profit milestone achieved. This allows you to react to the strategy's performance as it progresses.


## Function listenPartialLossAvailableOnce

This function lets you set up a one-time alert for specific changes in partial loss levels. You provide a filter to define exactly what kind of loss event you're interested in, and a function to run when that event happens. Once the matching event is detected and the function runs, the alert automatically stops listening, making it perfect for situations where you only need to react once to a particular condition. Think of it as a single, targeted trigger for loss-related changes.


## Function listenPartialLossAvailable

This function lets you keep track of when your trading strategy hits certain loss milestones, like losing 10%, 20%, or 30% of your initial capital. It’s like setting up alerts for significant downturns. The important thing is that these alerts are handled one at a time, ensuring that your code processes them in the order they occur, even if your alert handling code itself takes some time to complete. You provide a function that gets called whenever a loss level is reached, and this function is guaranteed to run sequentially.

## Function listenMaxDrawdownOnce

This function allows you to monitor for specific maximum drawdown events and react to them just once. You provide a filter – a condition that determines which events you're interested in – and a function to execute when that condition is met. After the function runs once, the monitoring automatically stops, making it perfect for scenarios where you only need to respond to a drawdown event a single time. It’s a clean way to react to a specific drawdown trigger and then forget about it.

## Function listenMaxDrawdown

This function lets you keep an eye on when your trading strategy hits new drawdown lows. It’s like setting up an alert that triggers whenever your strategy's losses reach a new minimum point.

The alerts will be delivered one at a time, even if the processing of each alert takes some time, ensuring things are handled in the right order.

It’s great for things like automatically adjusting your risk exposure based on how your strategy is performing.

To use it, you provide a function that will be called whenever a new drawdown event happens – this function will receive information about the event. The function returns another function that can be called to unsubscribe from the max drawdown events.

## Function listenIdlePingOnce

This function lets you react to idle ping events, which are signals about periods of inactivity in your system. It's designed for situations where you only need to perform an action once when a specific type of idle ping occurs. You provide a filter to specify which ping events you’re interested in, and then a function that will be executed when a matching event is detected. Once that function has run once, the subscription automatically stops.


## Function listenIdlePing

This function lets you listen for moments when your backtest isn't actively processing any trading signals. 

It's like getting a notification when things are quiet.

The function takes a callback – essentially, the code you want to run when an "idle ping" occurs. 

Each time a ping is sent when there are no signals being processed, your callback will be triggered. 

You can use this to perform maintenance tasks, log activity, or any other action that makes sense when the system is idle. 

The function returns a way to unsubscribe from these events when you no longer need them.


## Function listenHighestProfitOnce

This function lets you set up a one-time alert for when a specific trading event – a highest profit contract – occurs that meets certain criteria. You provide a filter that defines what kind of event you’re looking for, and a function that will be executed just once when that event happens. Once the event is processed, the alert automatically goes away, preventing further notifications. It’s a handy way to react to a particular profit milestone without needing to manage ongoing subscriptions. 

The filter you provide determines which events trigger the alert. The callback function you give is then executed once to handle that event.


## Function listenHighestProfit

This function lets you keep an eye on when a trading strategy achieves a new peak in profit. It’s like setting up a notification system – whenever the strategy's profit goes up to a higher level, you’ll get a signal. 

The signals are delivered one after another, even if your notification code takes some time to run. This ensures things happen in the right order. 

You provide a function that gets called with details about the new highest profit, and this function itself returns a way to unsubscribe from those notifications when you're done. This is perfect for things like monitoring progress and adjusting your strategy as it goes.

## Function listenExit

The `listenExit` function lets you be notified when something goes seriously wrong and stops the background processes like those used in Live, Backtest, or Walker.  It's for those critical errors that halt execution entirely, unlike the `listenError` which handles problems you can recover from.  When an error happens, your provided callback function will be called, and it will be executed one at a time to prevent any conflicts. You provide a function as input that will be triggered when a fatal error occurs. This function allows you to handle the error object that contains details about the error.


## Function listenError

This function lets you set up a listener that catches errors that happen while your trading strategy is running, but aren't critical enough to stop everything. Think of it as a safety net for unexpected problems like API connection issues.

When an error occurs, the provided function will be called to handle it – allowing your strategy to keep going. The errors are processed one at a time, in the order they happen, even if handling them takes some time. This ensures that errors are dealt with carefully and don't cause unexpected behavior. You can unsubscribe from these error notifications later by using the function that is returned.

## Function listenDoneWalkerOnce

This function lets you react to when a background task within your backtest completes, but only once. Think of it as setting up a listener that responds to a specific event – the completion of a background process – and then disappears after it fires.

You provide a filter to specify which completion events you're interested in, and a function that will be executed once when a matching event happens.  Once that callback runs, the listener automatically stops, preventing it from triggering again. It’s useful for actions you want to perform just one time after a particular background operation finishes.

## Function listenDoneWalker

This function lets you monitor when background tasks using the Walker framework finish running. 

Think of it as setting up a listener that gets notified when a longer process, initiated by `Walker.background()`, is finally done.

It makes sure that when a task completes, your code gets a notification, even if your code takes some time to process that notification – it handles things in a controlled, sequential order. This prevents unexpected issues that can arise from running things at the same time.

You provide a function (`fn`) that will be called whenever a background task finishes, and this function returns another function that you can use to unsubscribe from these notifications later on.


## Function listenDoneLiveOnce

This function lets you react to when a background task finishes running within your backtest. It’s designed for situations where you only need to handle the completion once and then don’t want to listen anymore.

You provide a filter – a test to see if the completed task is the one you’re interested in – and a function that will be executed when a matching completion event occurs. The function automatically stops listening after the callback runs just once, keeping your code clean and efficient. Essentially, it's a way to get notified about a specific background task's completion, but only once.


## Function listenDoneLive

This function lets you monitor when background processes run and finish within your backtest. It’s designed for tasks that need to happen after a background process completes, ensuring they are handled one at a time. You provide a function that will be called whenever a background process finishes, and it automatically makes sure those calls happen in order, even if they're complex operations. This helps avoid conflicts and keeps things predictable.


## Function listenDoneBacktestOnce

This function lets you react to when a background backtest finishes, but only once. You provide a filter – essentially a test – to decide which backtest completions you're interested in. Then, you give it a function that will be executed just one time when a matching backtest completes. After that function runs, it automatically stops listening for further backtest completions, so you don't need to worry about unsubscribing manually. It's ideal for actions that should happen just once after a specific backtest concludes.


## Function listenDoneBacktest

This function lets you register a callback that gets triggered when a background backtest finishes running. 

It's useful for tasks like cleaning up data or displaying results after a backtest is complete.

The callback you provide will be executed in a queued manner, ensuring that events are handled one at a time, even if your callback function involves asynchronous operations. This helps prevent any unexpected conflicts or issues that might arise from running multiple callbacks concurrently. Essentially, it makes sure things finish neatly and in order. You'll receive a `DoneContract` object containing information about the completed backtest.


## Function listenBreakevenAvailableOnce

This function lets you set up a listener that waits for a specific breakeven protection event to happen, but only reacts once. Think of it as setting a temporary alert – you’ll get notified when the condition you're looking for is met, and then the listener automatically stops listening. You provide a way to define what kind of breakeven event you’re interested in (using a filter function) and then what you want to do when that event occurs (the callback function). Once the callback has run, the listener shuts itself off, so it won't fire again.


## Function listenBreakevenAvailable

This function allows you to be notified whenever a trade's stop-loss automatically adjusts to the entry price, also known as breakeven. This happens when the trade has gained enough profit to cover the initial costs and fees.

You provide a function that will be called each time this breakeven protection kicks in. Importantly, this system makes sure that your function is executed one at a time, even if it takes a while to complete, ensuring smooth operation and preventing issues caused by running things simultaneously. You can unsubscribe from these events at any time by returning the value that this function provides.


## Function listenBeforeStartOnce

This function lets you set up a listener that reacts to events happening right before a backtest starts, but only once. It's like saying, "Hey, when this specific thing happens before the test, do this action, and then forget about listening." You provide a filter to specify which events you're interested in, and a function to execute when the event matches. The listener automatically stops listening after it's executed once, keeping things tidy.

## Function listenBeforeStart

This function lets you hook into the moment right before a trading strategy begins for a specific asset. You'll receive an event containing details about the strategy about to start. Importantly, any code you put inside your callback function will run one after another, ensuring that things happen in a predictable order even if your code takes some time to complete. This helps avoid unexpected behavior when the strategy kicks off. To stop listening, the function returns a function that you can call to unsubscribe.

## Function listenBacktestProgress

This function lets you keep tabs on how a backtest is running. It essentially sets up a listener that gets notified as the backtest progresses, providing updates along the way. 

The updates are delivered one after another, even if your code needs a little time to process each update – this ensures things don’t get jumbled up.

You provide a function as input; this function will be called whenever a progress update becomes available during the backtest's execution. The listener setup returns a function that you can call to unsubscribe from these progress updates.

## Function listenAfterEndOnce

This function lets you react to specific events that happen after a trading simulation concludes, but only once. You provide a filter that determines which events you're interested in, and a function to execute when a matching event occurs. Once the callback has run, the listener automatically stops, so you don’t have to worry about managing subscriptions. It’s a convenient way to perform a single action after a backtest completes, like saving results or performing a specific calculation.


## Function listenAfterEnd

This function lets you hook into what happens *after* a trading strategy finishes running for a particular asset. Think of it as a notification that signals the completion of a strategy’s execution.

It's designed to handle events sequentially, even if your callback function takes some time to complete – this prevents things from getting jumbled or interfering with each other.

Essentially, you provide a function (`fn`) that gets called whenever a strategy finishes, and this function will be executed after the core processing is done. You can unsubscribe from these notifications whenever you no longer need them.


## Function listenActivePingOnce

This function lets you set up a temporary listener that reacts to specific "active ping" events. Think of it as a one-time alert system. You tell it what kind of event you’re looking for using a filter, and it will run your provided function just once when that event occurs. After that, the listener automatically stops listening, so you don't have to worry about cleaning up. It's handy when you need to react to a particular condition appearing in the active ping data, and then you’re done.

You give it two things: a way to identify the event you want (the `filterFn`) and the action you want to take when that event appears (the `fn`). The function returns a cleanup function that you can use if you want to stop the listener early.

## Function listenActivePing

This function lets you keep an eye on active signals in your backtest. It listens for events, which happen every minute, that tell you about the status of these active signals. 

Think of it as a way to monitor how your signals are doing and to react to changes in their lifecycle. 

The events will be delivered in the order they happen, and the function makes sure that your code to handle these events runs one at a time, even if it involves asynchronous operations. You simply provide a function that will be called whenever a new active ping event occurs, and this function receives details about the event.


## Function listWalkerSchema

This function gives you a peek behind the scenes, listing all the different trading strategies (walkers) that are currently set up and ready to be used within the backtest-kit framework. Think of it as a directory of available tools. It's a really handy way to see what's available, understand how things are configured, or build interfaces that adapt to the types of strategies you’re using. The returned list contains details about each registered strategy, which is helpful for troubleshooting or creating custom dashboards.


## Function listStrategySchema

This function helps you discover all the trading strategies currently set up in your backtest-kit environment. It essentially gives you a list of all the strategies you've registered, allowing you to see what's available for backtesting. This is really handy if you need to check your configuration, create documentation, or build a user interface that dynamically displays available strategies. It returns a promise that resolves to an array of strategy schema objects.

## Function listSizingSchema

This function lets you see all the sizing schemas that are currently set up in your backtest kit. It’s like getting a complete inventory of how your trading strategies are determining order sizes. This is handy when you're trying to understand how your system is working, creating documentation, or building user interfaces that need to display sizing information. The function returns a list of these sizing configurations, allowing you to inspect them programmatically.

## Function listRiskSchema

This function provides a way to see all the risk configurations currently set up in your backtest. Think of it as a handy tool to check what risks your strategy is accounting for. It fetches a list of these risk configurations, which is helpful when you're troubleshooting, generating documentation, or building user interfaces that need to display this information. It returns a list containing all the registered risk schemas.


## Function listMemory

This function helps you retrieve all the stored memories associated with the current signal. 

It’s like looking through a collection of past events or data points related to your trading signal. 

The function automatically figures out which signal you're working with and whether you're in a backtesting or live trading environment.

You provide a bucket name to specify which set of memories you want to see, and it returns a list of memory entries containing both an ID and the content.


## Function listFrameSchema

This function lets you see all the different frame types your backtest kit is using. It’s like a directory listing for your trading environment's structure – it provides a list of all the predefined "frames" that are set up. This is super helpful for understanding how your backtest is organized, figuring out what data is available, or even building tools that automatically adapt to different configurations. You'll get a promise that resolves to an array of frame schema objects, each describing a different frame.

## Function listExchangeSchema

This function helps you see a complete list of all the exchanges that your backtest-kit setup recognizes. Think of it like getting a directory of available trading platforms. It's especially helpful if you're troubleshooting, creating documentation, or want to build a user interface that automatically adjusts to different exchanges. The function returns a promise that resolves to an array of exchange schema objects.

## Function hasTradeContext

This function simply tells you whether the system is currently in a state ready to execute trades. It checks if both the execution and method contexts are active. If both are enabled, it means you're good to go and can safely use functions that interact with the exchange, like fetching candle data or formatting prices. Think of it as a quick check to see if it's the right time to interact with the trading environment.

## Function hasNoScheduledSignal

This function, `hasNoScheduledSignal`, lets you quickly check if there's a scheduled signal currently active for a specific trading pair, like 'BTC-USDT'. It returns `true` if no such signal exists. Think of it as the opposite of checking *for* a signal; this tells you if one is definitely *not* present. This is useful if you're building logic that should only run when signals aren't already being generated. The function knows whether you're running a backtest or a live trading session and adjusts accordingly.

You just need to provide the symbol of the trading pair you want to check.


## Function hasNoPendingSignal

This function lets you quickly check if there's an existing signal waiting to be triggered for a specific trading pair. It returns `true` if there isn’t a signal waiting, meaning it’s safe to potentially generate a new one. Think of it as the opposite of `hasPendingSignal` – use it to ensure you’re not accidentally creating signals when there’s already an action in progress. It figures out whether you're running a backtest or a live trade on its own, so you don’t have to worry about that.

You just need to provide the trading pair's symbol, like "BTCUSDT," to use it.

## Function getWalkerSchema

This function helps you find the blueprint for a specific trading strategy, or "walker," within the backtest-kit system. Think of it as looking up the recipe for a particular trading approach.  You give it the name of the walker you're interested in, and it returns a detailed description of how that walker works – what data it needs, what calculations it performs, and how it makes trading decisions. This schema acts as a contract, defining exactly what's expected of that walker. 


## Function getTotalPercentClosed

This function, `getTotalPercentClosed`, helps you understand how much of a particular trading position remains open. It tells you the percentage of the original position that hasn’t been closed out, with 100% meaning the entire position is still active and 0% meaning it's completely closed. It’s smart enough to handle situations where you've added to the position over time using dollar-cost averaging (DCA) and had partial closures along the way. The function figures out whether it's running in a backtesting simulation or a live trading environment without you needing to specify. You just need to provide the trading symbol to get the percentage.


## Function getTotalCostClosed

`getTotalCostClosed` helps you figure out how much you’ve spent in total on a particular trading pair, like BTC/USD, when considering a position that hasn't been fully closed yet. It takes into account any dollar-cost averaging (DCA) you've done – essentially, it understands if you’ve been buying in smaller chunks over time and then closing those portions off. This function smartly knows whether it’s running in a backtesting simulation or a live trading environment. 

You simply provide the trading pair's symbol (e.g., "BTC/USD") to the function, and it will return the total cost in dollars.


## Function getTimestamp

This function provides a way to get the current timestamp within your trading strategy. It's useful for things like logging events or precisely timing actions.

When running a backtest, it will return the timestamp associated with the specific historical timeframe being analyzed. If you're running in a live trading environment, it gives you the actual, current timestamp. Essentially, it adapts to the mode your system is operating in.

## Function getSymbol

This function retrieves the symbol you're currently trading, providing the specific identifier for the asset being analyzed. It returns a promise that resolves to a string representing the symbol. Think of it as a quick way to know which stock, future, or cryptocurrency your backtest is focused on.

## Function getStrategySchema

The `getStrategySchema` function helps you find information about a specific trading strategy. Think of it as looking up the blueprint for a strategy – it gives you details like the inputs it expects and the outputs it produces. You provide the name of the strategy you’re interested in, and the function returns a structured description of that strategy. This is useful for understanding how a strategy works and ensuring it’s set up correctly.


## Function getSizingSchema

This function helps you find the specific rules for determining how much of an asset to trade. Think of it as looking up a predefined strategy for position sizing. You give it a name – a unique identifier – and it returns a detailed configuration outlining how that sizing strategy works. This configuration tells you exactly how the system will calculate the size of your trades based on factors like account balance, volatility, and other parameters.


## Function getSignalState

This function helps you retrieve a specific piece of data associated with a trading signal. It automatically figures out whether you're in a backtesting or live trading environment.

If a trading signal is active, it will grab that signal's information. Otherwise, it’ll give you back a default value you provided.

This is particularly useful for advanced strategies, especially those using AI, where you want to track performance metrics for each trade. Think of it as a way to keep track of how each trade is doing, like how long it's been open or its maximum gain. The examples in the documentation highlight how to use this for strategies that aim for specific profit targets and drawdown limits.

It requires you to provide the trading symbol and a default value to use if no signal is active.

## Function getSessionData

This function lets you access data specifically tied to your current trading setup - the symbol, strategy, exchange, and timeframe you're working with. Think of it as a place to store information that needs to be remembered between candles during a backtest or even across restarts in live trading. It's perfect for things like saving results from complex calculations or keeping track of intermediate steps that need to be carried over. The data is only accessible within the context of that particular trading environment. You provide the trading symbol you're interested in and it returns the stored data, or null if nothing is stored for that symbol.

## Function getScheduledSignal

This function lets you retrieve the currently scheduled trading signal, if one exists. It's designed to work whether you're backtesting or running live, automatically adjusting to the environment. You just need to tell it which trading pair (like 'BTC-USDT') you’re interested in. If no signal is scheduled for that pair, the function will return nothing.

## Function getRiskSchema

This function helps you find the details of a specific risk being tracked in your backtest. Think of it like looking up a definition – you give it the name of the risk, and it returns a structured description of what that risk represents and how it's measured. It's useful when you want to understand the specifics of a risk calculation within your trading strategy. You provide a unique identifier for the risk you're interested in, and the function gives you back a standardized way to understand it.

## Function getRawCandles

This function lets you retrieve historical candle data for a specific trading pair and timeframe. You can easily request a certain number of candles, or define a start and end date for the data you need. The function handles date ranges and automatically calculates the number of candles needed based on the provided dates.

It’s designed to work reliably within the trading environment, making sure it only uses past data and avoids any future information.

Here's a breakdown of how you can use it:

*   Specify a start date, end date, and the number of candles you want.
*   Provide just a start date and end date, and the function will determine the right number of candles.
*   Give an end date and a limit, and the function will figure out the start date.
*   Just provide a limit, and it will get candles from the current time back.

You can request data for trading pairs like "BTCUSDT" with intervals like "1m" (one minute) or "4h" (four hours).


## Function getPositionWaitingMinutes

This function helps you check how long a trading signal has been waiting to be put into action. It tells you the time, in minutes, that a scheduled signal has been pending. If there’s no scheduled signal currently waiting, it will return null. To use it, you simply need to provide the trading symbol (like BTCUSDT) to find out the wait time.

## Function getPositionPnlPercent

This function helps you quickly understand how your current open position is performing financially. It calculates the percentage profit or loss on your position, taking into account factors like partial trades, average cost basis (DCA), potential slippage, and trading fees.

If you don't have any open positions based on a trading signal, the function will return null. 

It intelligently figures out whether you're in a backtesting environment or live trading mode, and it also automatically gets the latest market price to ensure an accurate calculation. You just need to provide the symbol of the trading pair.


## Function getPositionPnlCost

This function helps you understand the unrealized profit or loss on a trade you're currently holding. It tells you how much money you've gained or lost based on the difference between your entry price and the current market price, considering factors like how you built your position (like dollar-cost averaging), any slippage or fees, and partial closes. If there's no open trade, it will return null. The function handles fetching the current price for you and adapts to whether you're running a backtest or a live trading scenario. To use it, you simply provide the trading pair symbol.

## Function getPositionPartials

This function lets you see how much of your position has been partially closed for profit or loss. It provides a breakdown of each partial close event that has occurred, detailing the percentage closed, the price at which it was executed, the cost basis at the time, and the number of DCA entries involved. 

If there's no active trading signal, the function will return null. If partial closes haven't happened yet, it will return an empty array. You'll need to provide the symbol (like "BTC-USDT") to specify which position's partials you're interested in.

## Function getPositionPartialOverlap

This function helps you avoid accidentally closing a position partially multiple times at roughly the same price. It checks if the current market price falls within a small range around previously executed partial close prices.

Think of it like this: if you've already partially closed a position at $100, this function will consider prices close to $100 (within a configurable tolerance) as potentially already handled.

It calculates a tolerance range based on the partial close price and percentages you define. If the current price falls within that range, it signals that a partial close might not be necessary.

You provide the symbol of the trading pair and the current price to check. Optionally, you can specify the tolerance range, but if you don't, it defaults to a 1.5% range around the partial close price. The function returns `true` if the current price is within the tolerance range of an existing partial, and `false` otherwise, effectively preventing redundant actions.

## Function getPositionMaxDrawdownTimestamp

This function helps you pinpoint exactly when a specific trading position experienced its biggest loss. It returns a timestamp, indicating the moment the price hit its lowest point for that position. If there's no active trading signal for the specified symbol, the function will return null, meaning there's nothing to analyze. You simply provide the symbol of the trading pair you're interested in, and the function will give you that critical drawdown timestamp.

## Function getPositionMaxDrawdownPrice

This function helps you understand the most significant losses experienced by a specific trade. It identifies the lowest price reached during the entire period that a position was open. 

Think of it as a way to see how far “in the red” a trade went at its worst point.

If there isn't a current or pending trade for the symbol you're asking about, the function will return nothing.

You provide the symbol, like "BTC-USDT", and it returns a number representing the price at that lowest point.

## Function getPositionMaxDrawdownPnlPercentage

This function helps you understand the performance of a specific trading position. It calculates and returns the percentage of profit or loss that occurred at the point when the position experienced its greatest drawdown. Think of it as showing you the lowest profit level the position reached during its entire lifespan. If there are no active trading signals, the function will return null. You'll need to provide the symbol of the trading pair you're interested in, such as "BTC-USDT".

## Function getPositionMaxDrawdownPnlCost

This function helps you understand the financial impact of a trading position. It calculates the total cost in terms of profit and loss, specifically looking at the point where the position experienced its biggest drawdown – its most significant loss. Think of it as figuring out how much you lost at the worst possible time for that trade. 

The function requires you to specify the trading pair, like "BTC-USDT". If there aren't any active trading signals for that pair, the function will return null.

## Function getPositionMaxDrawdownMinutes

getPositionMaxDrawdownMinutes tells you how much time has passed since a trading position experienced its lowest point. Think of it as measuring the duration of the biggest loss so far. The value will be zero right at the moment the loss reaches its lowest. If there's no active trade happening for that symbol, you won't receive a value—instead, it will return null. You specify which trading pair (like BTC/USD) you're interested in when you call this function.

## Function getPositionLevels

`getPositionLevels` helps you check the prices at which your dollar-cost averaging (DCA) strategy has entered a trade. 

It gives you a list of prices, starting with the initial price when the trade was first started. 

If you've added more prices by using `commitAverageBuy`, those will appear in the list as well. 

If there's no active trade currently being built up, the function will return nothing. If a trade exists, but you only bought at the initial price, it will return an array containing just that initial price. You’ll need to provide the trading symbol to this function to get the relevant data.

## Function getPositionInvestedCount

This function tells you how many times you've added to a position through dollar-cost averaging (DCA) for a specific trading pair. 

It essentially counts the number of DCA entries made after the initial trade. 

A value of 1 means it's just the original trade, while higher numbers reflect subsequent DCA buys. 

If there’s no ongoing trade to track, it will return null. 

You don't need to worry about whether you're in a backtest or live trading environment, as it figures that out automatically. You just need to specify the trading pair's symbol.

## Function getPositionInvestedCost

This function helps you figure out how much money you've put into a particular trading position. It calculates the total cost basis, which includes all the costs associated with buying into that position.

Think of it as finding the total amount spent to build up your holdings for a specific trading pair.

If there isn't a trading position currently being set up, the function will return null. It automatically knows whether it's running a test or a live trading environment. You simply need to provide the trading pair symbol as input, like "BTC-USDT".

## Function getPositionHighestProfitTimestamp

This function helps you find out exactly when a trading position reached its highest profit point. It tells you the timestamp—a specific date and time—when the price was most favorable for that trade. If there's no trading activity or pending signals for a particular symbol, the function will return null. You provide the symbol of the trading pair (like BTC-USDT) to get this information.

## Function getPositionHighestProfitPrice

This function helps you find the highest price a position has reached while being profitable. 

It essentially remembers the best price achieved in a favorable direction since the position started. 

For long positions, it tracks the highest price above the entry price; for short positions, it tracks the lowest price below the entry price. 

It starts with the entry price when a position opens and updates as new prices come in. 

You'll always get a value back – at least the entry price – as long as the position is active.

## Function getPositionHighestProfitMinutes

This function tells you how long ago a trading position reached its highest profit. 

It essentially calculates the time passed since the position's peak profit was achieved.

Think of it as a measure of how far the position has fallen from its best point – if it's been a while, it means the profit has receded.

The value will be zero at the exact moment the highest profit was recorded.

If no trading signals are currently active for the given symbol, the function will return null.

You need to provide the symbol of the trading pair (like 'BTCUSDT') to get the information.

## Function getPositionHighestProfitDistancePnlPercentage

This function helps you understand how far your trading position has moved from its peak profit. 

It calculates the difference between the highest profit percentage achieved and the current profit percentage. 

The result tells you how much room there is for potential losses if the price continues to decline from that peak – essentially, it’s a measure of the "distance" from the best point so far.

If there's no trading signal in place, the function will return null because it can't calculate a distance without a signal to relate to. You provide the trading pair symbol to specify which position you're analyzing.

## Function getPositionHighestProfitDistancePnlCost

This function helps you understand how far your current trading position is from its potential best performance. It calculates the difference between the highest profit it could have achieved (peak profit) and the profit you're currently experiencing. This tells you how much room there is for improvement or how well your current strategy is performing relative to its best possible outcome. The function requires the trading symbol (like 'BTC-USDT') to operate and will return a number representing that distance. If there's no active trading signal, it won't be able to provide a result.

## Function getPositionHighestProfitBreakeven

This function helps you determine if a trading position could have realistically reached a breakeven point at its peak profit. It checks if the mathematical calculations show a possibility of breakeven at the highest achieved profit for a specific trading pair. If there are no active trading signals for that symbol, it will return null, indicating it can't perform the check. Essentially, it's a way to assess the viability of a past trade's performance. You provide the symbol of the trading pair (like 'BTCUSDT') and it will tell you if breakeven was within reach at the best price.

## Function getPositionHighestPnlPercentage

This function helps you understand the peak profitability of a specific trading pair. 

It tells you the highest percentage profit achieved by a position at any point in its history. 

Think of it as finding the absolute best moment for that trade.

If no trading signals are present, the function will return null. 

You simply provide the symbol of the trading pair you're interested in, such as "BTCUSDT", and it gives you that peak percentage profit.

## Function getPositionHighestPnlCost

This function helps you understand the maximum cost incurred while trying to reach the highest profit point for a specific trading pair. It essentially tells you how much you lost (in the quote currency, like USD or EUR) at the point when the position was performing its best. If there are no signals pending, it will return a null value. You provide the trading pair symbol (like "BTC-PERP") as input to get this information for that particular trade.

## Function getPositionHighestMaxDrawdownPnlPercentage

This function helps you understand how much your trading position has recovered from its lowest point. It calculates the difference between your current profit percentage and the biggest drop in profit percentage you’ve experienced.

Essentially, it's a way to see how well your position has bounced back from its worst performance. The result is a percentage, and you’ll get null if there isn’t a trading signal currently active.

You provide the trading symbol – like BTC/USD – as input to the function.

## Function getPositionHighestMaxDrawdownPnlCost

This function helps you understand how much worse your current position could have been. It calculates the difference between your current profit/loss and the lowest point your position reached. Essentially, it shows you the potential “distance” you’ve traveled from the worst drawdown. If there’s no active trading signal for a particular symbol, the function won’t return a value. You provide the symbol of the trading pair to analyze.

## Function getPositionEstimateMinutes

This function helps you understand how long a trading position is expected to last. It looks at the currently active trading signal and tells you the originally estimated duration in minutes. Think of it as checking the plan for how long the position should remain open before automatically closing due to time constraints. 

If there isn't an active trading signal, the function will return null. You provide the trading pair symbol (like BTCUSDT) as input to see the estimate for that specific pair.

## Function getPositionEntryOverlap

getPositionEntryOverlap helps you avoid accidentally entering a DCA position at a price you've already targeted. It checks if the current market price aligns with any of your existing DCA entry levels, giving you a way to prevent overlapping entries. The function examines if the current price is within a defined range around each entry level, considering a tolerance zone based on percentages. If the price falls within this tolerance zone for any level, the function returns true, signaling a potential overlap. Otherwise, or if there are no existing entry levels, it returns false. You provide the symbol and the current price to check, and optionally configure the tolerance range.

## Function getPositionEntries

getPositionEntries lets you peek into the details of how a position is being built, especially when using DCA (Dollar Cost Averaging). It returns a list showing the prices and costs for each step – whether it's the initial purchase or a subsequent DCA commit. If there's no ongoing trade being built, you'll get nothing back. If you’ve made just one initial purchase without any DCA, you’ll get a list with just that one entry. This list helps you understand exactly how much was spent at each price point to build up your position. You specify the trading pair, like 'BTCUSDT', to get the entries for that specific pair.

## Function getPositionEffectivePrice

getPositionEffectivePrice helps you determine the average entry price for your current trading position, taking into account any dollar-cost averaging (DCA) adjustments. It essentially calculates a weighted average of your purchase prices, giving more weight to trades made at lower prices.

If you've made partial closes of your position, the calculation considers the cost basis from those partials before blending in any later DCA entries.  If you haven't used any DCA, it will simply return the initial opening price.

You won’t get a result if there’s no active trade signal currently being tracked.  The function intelligently adapts to whether you're running a backtest or a live trading session.

You only need to provide the symbol of the trading pair, like "BTCUSDT", as input.

## Function getPositionDrawdownMinutes

getPositionDrawdownMinutes tells you how much time has passed since your current trade reached its highest profit point. Think of it as a measure of how far your trade has fallen from its best moment.

It will be zero when the trade first becomes profitable.

The number will increase as the price moves against you, showing you the duration of the pullback.

If there’s no active trade for a particular symbol, this function won’t return a value.

You need to provide the symbol of the trading pair you’re interested in, like 'BTCUSDT'.

## Function getPositionCountdownMinutes

This function helps you figure out how much time is left on a pending trading position. It calculates the time remaining based on when the position was initially set and an estimated time, ensuring the result is never a negative number. If there's no pending position to begin with, the function will let you know by returning null. You provide the symbol of the trading pair – like BTCUSDT – to identify which position's countdown you want to check.

## Function getPositionActiveMinutes

getPositionActiveMinutes helps you figure out how long a particular trade has been running. It gives you the number of minutes since the position began. 

If there's no ongoing trading signal for that symbol, it won't return a value. 

You just need to provide the symbol of the trading pair you're interested in, like 'BTCUSDT', and it'll tell you how long that position has been open.


## Function getPendingSignal

This function helps you find out what signal your trading strategy is currently waiting on. 

It checks for an active, pending signal for a specific trading pair, like "BTCUSDT."

If there isn't a pending signal, it will tell you by returning nothing (null).

It figures out whether you're in a backtest or live trading environment without needing to tell it.

You just need to provide the symbol of the trading pair you're interested in.

## Function getOrderBook

This function lets you retrieve the order book for a specific trading pair, like BTCUSDT. It pulls data from the exchange you're connected to. 

The function considers the current time when fetching the order book – this is important for accurately simulating trading scenarios. The exchange itself decides how to use that time information, whether for backtesting or live trading. 

You specify the trading pair (symbol) you want the order book for. You can also control how many levels of depth to retrieve; if you don't specify a depth, it uses a default value.

## Function getNextCandles

This function helps you grab a batch of historical candles for a specific trading pair and timeframe. It looks ahead from the current time to get the candles that come after. 

You tell it which trading pair you’re interested in, like "BTCUSDT," what timeframe you want to see the candles in (options like "1m" for one-minute candles, "1h" for one-hour candles, etc.), and how many candles you need. It then fetches those candles from the exchange, allowing you to analyze past price movements.


## Function getMode

This function tells you whether your trading strategy is running in backtesting mode (simulating past data) or live trading mode. It returns a promise that resolves to either "backtest" or "live," so you can adjust your logic accordingly. Think of it as a simple way to know if you're practicing or actually trading.

## Function getMinutesSinceLatestSignalCreated

This function helps you determine how much time has passed since the most recent trading signal was generated for a specific asset, like a particular cryptocurrency pair. It's really handy if you need to implement a waiting period, or "cooldown," after a stop-loss order is triggered.

It looks for this information in your historical backtest data first, and if it can't find it there, it checks your current, live data.

If absolutely no signals have been recorded for that asset, the function will return null. It automatically adjusts to whether you’re running a backtest or a live trade.

You only need to provide the trading pair symbol – for instance, “BTCUSDT” – as input.

## Function getMaxDrawdownDistancePnlPercentage

This function helps you understand the riskiness of a trading strategy by calculating the maximum drawdown. It essentially figures out the biggest difference between the highest profit you've ever seen and the lowest point your profits have reached.

The result is expressed as a percentage, showing how far your profits could potentially fall from a peak.

You provide the trading pair symbol, like "BTC-USDT", to specify which strategy you want to analyze. 

If no signals exist for that symbol, the function won't be able to calculate a drawdown and will return a null value.


## Function getMaxDrawdownDistancePnlCost

This function helps you understand the potential risk of a trading strategy. It calculates the maximum difference between the highest profit and the biggest loss experienced during a backtest. 

Essentially, it tells you the largest "hit" your position could have taken from its peak profitability.

The result represents the PnL cost distance, and a zero or positive value indicates a potential risk exposure. If no trading signals exist for the specified symbol, the function will not return a value. You need to provide the trading pair symbol, like "BTCUSDT," to run the calculation.

## Function getLatestSignal

This function helps you retrieve the most recent trading signal for a specific instrument, like BTC/USDT. It doesn't care if the signal led to a winning trade or a loss; it simply gives you the latest one recorded. You can use this to implement things like cooldown periods – for example, to prevent opening new positions immediately after a stop-loss event. It looks for signals first in historical data and then in recent live data, returning nothing if no signals exist. It figures out whether it's running a backtest or a live trade automatically. You just need to specify the trading pair symbol.

## Function getFrameSchema

The `getFrameSchema` function lets you look up the structure of a specific frame within your backtest. Think of it as finding the blueprint for how data is organized in a particular step of your backtesting process. You give it the frame's name, and it returns a detailed description of what that frame contains – what data fields it has, and their types. This is handy when you need to understand the exact format of data you're working with in your backtest logic.

## Function getExchangeSchema

This function lets you fetch the details of a specific cryptocurrency exchange that backtest-kit knows about. Think of it as looking up the blueprint for how that exchange works within the system. You provide the exchange’s name – like "Binance" or "Coinbase" – and it returns a structured description outlining things like available trading pairs, data formats, and other exchange-specific characteristics. This information is crucial for accurately simulating trades and analyzing strategies on that exchange.


## Function getDefaultConfig

This function provides you with a set of default settings for the backtest-kit framework. Think of it as a starting point for your configurations. It provides preset values for things like how often the system checks for price data, limits on slippage and fees, maximum distances for stop-loss and take-profit orders, and constraints on signal generation and notification frequency. You can look at these default values to understand all the possible configuration options and what they're set to by default before you customize them for your specific backtesting needs.

## Function getDefaultColumns

This function provides a pre-built set of column configurations used for generating reports. 

It's essentially a template for organizing data into columns when creating reports, covering various aspects of your backtest like strategy performance, risk metrics, and event timelines. 

Think of it as a cheat sheet to understand the structure of the report and what kinds of data can be displayed. You can use the returned configuration as a starting point when you want to customize your own report layout.

## Function getDate

This function retrieves the date that the backtest or live trading system is currently operating on. 

Think of it as giving you the "now" date as seen by the trading environment. 

When you're running a historical simulation (backtest), it will return the date associated with the specific timeframe you're analyzing. 

If you're actively trading, it returns the present date in real-time.

## Function getContext

This function retrieves information about the method's current environment. 
Think of it as getting a snapshot of the conditions surrounding the code being executed.
It returns an object containing details like the method's state and available resources.
This context object provides valuable insights for understanding and debugging your backtesting strategies.

## Function getConfig

This function lets you peek at the global settings used by the backtest-kit framework. Think of it as getting a snapshot of how things are currently configured. It’s designed to be read-only; the returned values can't be directly changed, ensuring the core system settings remain stable. This is helpful for understanding the system's behavior or debugging issues without altering the actual configuration. The returned object contains various numeric values and boolean flags controlling aspects like data fetching, signal generation, order management, and reporting, each related to different aspects of the backtesting process.

## Function getColumns

This function gives you a peek at how your backtest results will be displayed in markdown reports. It provides the column definitions for different data sets like closed trades, heatmaps, live ticks, and performance metrics. Importantly, it returns a copy of the column settings, so you can examine them without changing the underlying configuration. Think of it as a way to see what's going on under the hood when your reports are created.

## Function getClosePrice

This function lets you quickly retrieve the closing price from the most recent candle for a specific trading pair and time interval. Think of it as getting a snapshot of the price at the end of a particular period, like the last 5-minute or 4-hour candle. You need to specify which trading pair you're interested in, such as BTCUSDT, and what time interval you want the data for, like every 15 minutes. The function will then give you the closing price value for that candle.

## Function getCandles

This function retrieves historical price data, presented as candles, from a connected exchange. You provide the trading pair, like "BTCUSDT," the timeframe you want (options include intervals like 1 minute, 5 minutes, or 4 hours), and how many candles you need. It pulls this data starting from the present time and relies on the exchange’s method for getting candles. The returned data is an array of candle objects, each containing open, high, low, close prices, and the candle’s timestamp.


## Function getBreakeven

This function helps determine if a trade has become profitable enough to cover associated costs. It examines the current price of a trading pair and compares it to a calculated threshold representing the sum of slippage and fees, essentially checking if the price has moved sufficiently in the expected direction to break even. The function is designed to work seamlessly in both backtesting and live trading environments, adapting to the execution context automatically. You provide the symbol of the trading pair and the current price, and the function returns true if the breakeven point has been surpassed.


## Function getBacktestTimeframe

This function lets you find out the dates the backtest kit is using for a specific trading pair, like BTCUSDT. It returns a list of dates representing the timeframe that the backtest will analyze. You give it the trading symbol, and it gives you back a list of dates to work with.

## Function getAveragePrice

This function helps you figure out the average price a security has traded at, using a technique called Volume Weighted Average Price, or VWAP. It looks at the recent trading activity – specifically, the last five one-minute intervals – to do this calculation. Essentially, it gives more weight to prices where there was a lot of trading volume. If there's no trading volume data available, it will just calculate a simple average of the closing prices instead. You provide the symbol of the asset you're interested in, like "BTCUSDT" for Bitcoin against USDT.

## Function getAggregatedTrades

This function retrieves a history of combined trades for a specific trading pair, like BTCUSDT. It pulls this data directly from the exchange you've configured.

By default, it fetches trades within a set time window. You can also specify a `limit` to get just a certain number of recent trades, and it will fetch them in chunks if necessary. Think of it as pulling the most recent activity for a trading pair.


## Function getActionSchema

This function helps you find the blueprint for a specific action within the backtest-kit system. Think of it like looking up the rules or required inputs for a particular trading action, like "buy" or "sell". You give it the name of the action you're interested in, and it gives you back a detailed description of what that action entails – things like what parameters are needed and what data types they should be. This is useful for validating actions and ensuring they're set up correctly.


## Function formatQuantity

The `formatQuantity` function helps ensure your trade amounts are displayed correctly according to the rules of the specific exchange you’re using. It takes the trading pair symbol, like "BTCUSDT", and the numerical quantity you want to trade as inputs. The function then uses exchange-specific rules to format the quantity, guaranteeing the right number of decimal places are used, so your orders look accurate when sent to the exchange. It returns the formatted quantity as a string.

## Function formatPrice

This function helps you display prices correctly for different trading pairs. It takes a trading symbol, like "BTCUSDT", and a raw price number, and then formats the price to match the specific rules of the exchange it's used on. This ensures the displayed price shows the correct number of decimal places as required by the exchange, making your trading interface look and feel professional. It returns a formatted string representation of the price.


## Function dumpText

The `dumpText` function is your tool for sending raw text data, like logs or reports, related to a specific signal. Think of it as a way to record observations during a backtest or live trading session. It handles the technicalities of figuring out where to send the data (based on the signal) and whether you're in a testing or live environment, so you don't have to worry about those details. 

You provide information like the bucket name, a unique identifier for the dump, the actual text content, and a short description of what the text represents.  The function then takes care of delivering that information.


## Function dumpTable

This function helps you display data neatly as a table within your backtesting or live trading environment. It takes an array of objects – essentially, your data – and presents it in a structured table format. 

The function figures out which signal to associate with this table automatically, and it adapts to whether you're running a backtest or a live trading session. 

It intelligently determines the column headers for your table by looking at all the different keys used across all the objects in your data. You just provide the data itself and a description for the table.


## Function dumpRecord

The `dumpRecord` function lets you save a snapshot of data—essentially a flat collection of key-value pairs—along with a description, into a designated storage bucket. Think of it as creating a labeled record of a specific moment during your backtest or live trading. It cleverly figures out whether you're in a backtesting environment or a live trading scenario, and handles signal management for you, removing some of the manual setup. You just provide the data you want to save, where you want to save it, and a short description.


## Function dumpJson

The `dumpJson` function helps you save complex data structures as JSON within your backtesting or live trading environment. It takes a description, a unique ID, a bucket name, and the data itself – essentially, anything you want to record as a formatted JSON block.  This function automatically handles the technical details of knowing whether you're running a backtest or a live trading session, and seamlessly integrates with the existing signal system. Think of it as a convenient way to log data for later analysis or debugging. It's designed to be easy to use, letting you focus on the data itself, rather than the intricacies of how it’s saved.


## Function dumpError

This function helps you record and report errors that happen during your backtesting or live trading. It takes details about the error – like a bucket name, a unique ID, the error message itself, and a brief description – and sends them for analysis. The function cleverly figures out whether it’s running a backtest or a live trading scenario and handles signal execution automatically, ensuring the error is associated with the correct trading activity. It simplifies the process of tracking and understanding issues that arise during your trading simulations or real-time trading.


## Function dumpAgentAnswer

This function lets you save the complete conversation history of an agent, linked to a specific signal. 

It's really helpful for debugging and understanding exactly what happened during a trade.

The function handles the details for you, figuring out which signal it belongs to and whether you're running a backtest or a live trading environment.

You provide a data object that includes the bucket name, a unique dump ID, the messages exchanged, and a brief description of the dump. This function then permanently stores this information for later review.


## Function createSignalState

This function helps you manage and track the state of signals within your trading strategies. It provides a simple way to get and update signal information, automatically knowing whether it's running in backtest or live mode. 

Think of it as creating a dedicated space for your signal data, allowing you to accumulate metrics like peak profit or how long a trade has been open. This is particularly useful for complex strategies, like those driven by AI, that need to analyze data across multiple trades to make decisions. It aims to help strategies to consistently manage risk and achieve good returns, even in challenging market conditions.


## Function commitTrailingTakeCost

This function lets you change the take-profit price for a trade to a specific price level. It handles the behind-the-scenes conversion, figuring out how to adjust the percentage shift based on the original take-profit distance. The framework will automatically determine whether it's running a backtest or a live trading environment and it also fetches the current average price to make the calculations accurate. You just provide the trading pair's symbol and the desired take-profit price.


## Function commitTrailingTake

This function helps you fine-tune your trailing take-profit levels for ongoing trades. It’s designed to make adjustments to the original take-profit distance you set initially.

It’s really important to remember that it always calculates changes based on that original take-profit distance, not any adjustments you’ve made along the way – this helps to prevent small errors from adding up over time.

When you make adjustments, the system will only move the take-profit closer to the entry price. It will not move it further away.

For long positions, it will only accept a lower (more conservative) take-profit. For short positions, only a higher (more conservative) take-profit will be applied.

The function handles whether it’s running in a backtest or live trading environment automatically.

You provide the trading symbol, the percentage adjustment you want to make to the original take-profit, and the current market price.


## Function commitTrailingStopCost

This function lets you set a specific price for your trailing stop-loss order. It's a handy shortcut – you tell it the price you want, and it figures out how to adjust the percentage shift based on your initial stop-loss distance. It works whether you're testing a strategy (backtesting) or actively trading (live mode). The function also automatically gets the current market price to ensure the calculation is accurate.

You provide the symbol of the trading pair and the new stop-loss price you want to set.

The function then returns a boolean value to indicate whether the adjustment was successful.


## Function commitTrailingStop

The `commitTrailingStop` function helps you manage your trailing stop-loss orders. It lets you dynamically adjust the distance of your stop-loss based on a percentage change, making it more responsive to market movements. 

It's important to remember that this function works with the *original* stop-loss distance you initially set, not any adjustments already made by the trailing stop. This prevents small errors from building up over time.

The function will only tighten your stop-loss (move it closer to your entry price) if the new adjustment is genuinely better at protecting your profits. For long positions, it will only allow your stop-loss to move higher, while for short positions, it will only allow it to move lower. 

You provide the trading symbol, the percentage adjustment you want to make, and the current market price for the function to evaluate. It automatically understands if you’re running a backtest or a live trading session.

## Function commitSignalNotify

This function lets you send out informational messages related to your trading strategy. Think of it as a way to create custom notes or alerts during a trade. You can use it to track decisions, trigger external notifications, or log events happening within your strategy, like a specific indicator reaching a certain level. 

It's designed to be simple – you provide the trading symbol (like BTCUSDT) and optionally some extra information about the event. The function automatically grabs details like whether you're backtesting or live trading, as well as your strategy and exchange names. It even gets the current price for you. It won't change your position, just provides the notification.

## Function commitPartialProfitCost

This function lets you partially close a trade when you've reached a specific profit target measured in dollars. It's a simple way to lock in some gains while still letting the trade potentially run further. 

The function automatically handles figuring out what percentage of your initial investment corresponds to the dollar amount you specify. 

It works by closing a portion of your position – the price must be moving in a direction that brings the trade closer to its take profit level. 

The function handles the details like fetching the current price and adjusting for whether you are backtesting or running live, making it easy to use. You just need to provide the symbol you're trading and the dollar amount you want to close.

## Function commitPartialProfit

This function helps you automatically take some profit from a trade as the price moves in a favorable direction. It lets you specify a percentage of your open position to close, like closing 25% or 50%. The function will only execute if the price is trending towards your target profit level. It intelligently adapts to whether you’re running a backtest or a live trading environment. You provide the trading symbol and the percentage of the position you want to close.


## Function commitPartialLossCost

This function lets you partially close a position to limit losses, specifying the dollar amount you want to recover. It's a shortcut that calculates the equivalent percentage of your position cost for you. This function only works when the price is trending in the direction of your stop-loss. 

The system intelligently figures out if it's running in a backtest or live environment and automatically gets the current price for the trade.

To use it, you’ll need to provide the trading symbol and the dollar amount you wish to recover. For example, a value of 100 will close a position by the dollar amount of 100.

## Function commitPartialLoss

This function lets you partially close an open position when the price is trending in a losing direction, essentially moving towards your stop-loss level. It allows you to reduce your exposure by closing a specific percentage of your position, automatically adjusting to whether you're in a backtesting or live trading environment. You provide the symbol of the trading pair and the percentage of the position you want to close, with the percentage needing to be between 0 and 100. This helps in managing risk and potentially minimizing losses on a trade.


## Function commitClosePending

This function lets you finalize a previously initiated closing of a trade, essentially cleaning up a pending signal. Think of it as confirming the closing action without interrupting the strategy's regular operation – it won't halt signal generation or execution. It specifically targets signals that are already in a 'pending' state, meaning a closing order was previously initiated. This allows you to manage trade closures without interfering with the ongoing decision-making of your trading strategy. You can optionally include a note or ID with the closure for tracking purposes. The framework intelligently adapts to whether it's running a backtest or a live trading session.

## Function commitCancelScheduled

This function lets you cancel a previously scheduled signal for a specific trading pair. Think of it as a way to remove a signal that's waiting to be triggered by a price movement. It's designed to be gentle – it won't interrupt the strategy's normal operation or stop it from creating new signals.

You can also include extra information, like an ID or a note, when you cancel the signal.

It handles whether you're in a backtesting or live trading environment automatically.

## Function commitBreakeven

This function helps manage your trades by automatically adjusting the stop-loss once a certain profit level is reached. It essentially moves your stop-loss to your entry price, eliminating risk and locking in profits.

Think of it as a safety net – if the price moves favorably, it automatically shifts your stop-loss to break even, taking into account transaction fees and a small buffer.

The function smartly determines if it's running in a backtesting environment or a live trading situation and gets the current price information for you. You just need to provide the trading pair symbol, like "BTCUSDT", and it handles the rest.


## Function commitAverageBuy

The `commitAverageBuy` function helps you add to a position using a dollar-cost averaging (DCA) strategy. It automatically calculates the current market price and adds a new purchase order to the position's record, essentially building a history of your buys.

Think of it as a way to incrementally increase your investment in a particular asset. Each time you call this function, it updates a running average of the price you paid, and signals that a new average buy has been made. It knows whether it's running a backtest or a live trading session, making it flexible for different environments. It retrieves the current price without you needing to explicitly fetch it.


## Function commitActivateScheduled

This function lets you trigger a previously scheduled trading signal before the price actually hits the target price. It's useful when you need to act on a signal ahead of time. 

Think of it as giving a signal a little nudge. It sets a flag indicating the signal should be activated, and the framework handles the actual activation during the next price update. The framework automatically recognizes if it's running a backtest or a live trading environment.

You’ll need to specify the trading symbol (like "BTCUSDT") and optionally, a payload that includes a unique ID and a note for your records.

## Function checkCandles

The `checkCandles` function verifies if your historical candle data is already available and stored. It’s a quick way to see if you need to download more data before running a backtest. Instead of downloading the entire dataset, it smartly checks for each expected timestamp to see if the data is present, making the process much faster if most of your data is already there. This function works by interacting with your persistence adapter, which handles the actual storage and retrieval of the data.

## Function cacheCandles

This function helps to make sure your historical price data (candles) for a specific trading symbol and timeframe are available and up-to-date in your persistent storage. It works by first checking if the data exists, and if not, it downloads the missing data and then checks again to confirm everything is good. It’s designed to keep your backtesting environment properly stocked with the information it needs.

The function requires details like the symbol (e.g., BTC/USDT), the timeframe (e.g., 1 hour), the starting and ending dates of the data you need, the name of the exchange, and optional callbacks to track the start of checks and the warm-up phase.

## Function addWalkerSchema

This function lets you register a "walker," which is essentially a way to run backtests for multiple strategies simultaneously and directly compare their results. Think of it as a tool to easily see how different trading approaches stack up against each other using the same historical data. You provide a configuration object that defines how the walker should operate, setting up the rules for the comparison. This allows for efficient analysis and helps identify which strategies perform best under similar conditions.

## Function addStrategySchema

This function lets you officially register a trading strategy with the backtest-kit framework. Think of it as telling the system, "Hey, I've got this strategy I want to use."

When you register a strategy using this function, the system will automatically check it to make sure it's behaving correctly – things like ensuring price data and trade stop-loss/take-profit logic are all valid.

It also prevents a flood of signals by managing how often signals are generated and makes sure your strategy's data survives even if unexpected issues occur when running live.

You provide the strategy’s configuration details, represented as an object adhering to the `IStrategySchema` interface, to complete the registration.

## Function addSizingSchema

This function lets you tell the backtest-kit how to determine the size of your trades. Think of it as defining your risk management strategy.

You provide a sizing configuration object that specifies things like whether you want to use a fixed percentage of your capital, a Kelly criterion approach, or something based on Average True Range (ATR). 

It also allows you to set limits on your position sizes, ensuring you don't risk too much on any single trade. You can even include custom logic to adjust sizing based on specific events. Essentially, it's how you tell the backtest-kit *how* much to trade.


## Function addRiskSchema

This function lets you tell the backtest-kit framework about your risk management rules. 

Think of it as defining the boundaries for how much risk your trading strategies can take on. 

You can set limits on the total number of open positions across all your strategies, and create more complex checks to ensure your portfolio behaves as expected. 

For example, you could define rules about correlations between assets or monitor specific portfolio metrics. 

The system keeps track of all active trades across your strategies, which allows for risk management that considers the overall portfolio, not just individual strategies. This ensures different strategies don't unknowingly trigger excessive risk.


## Function addFrameSchema

This function lets you tell the backtest-kit about a new timeframe you want to use for your simulations. Think of it as adding a specific schedule—like daily, weekly, or monthly—that dictates the dates and intervals your backtesting will cover. It’s crucial for defining the scope and granularity of your backtests.

You provide a configuration object which describes the timeframe, telling the system when to start, when to finish, and how frequently it should generate those time periods. This allows for flexible backtesting across different periods and resolutions.


## Function addExchangeSchema

This function lets you tell the backtest-kit framework about a new exchange you want to use for your simulations. Think of it as adding a data source—like Coinbase or Binance—so the framework knows where to pull historical price data.

It's how you integrate your specific exchange’s data and formatting rules into the backtesting process. The exchange schema you provide will define things like how candle data is structured and how prices are displayed. 

This also enables features like calculating Volume Weighted Average Price (VWAP) based on recent trade data from your exchange.


## Function addActionSchema

This function lets you register a new action handler within the backtest-kit framework. Think of actions as a way to react to events happening during your backtest, like when a trade hits a profit target or a stop-loss. You can use these actions to do things like update your state management system (like Redux), send notifications to a chat group, track performance metrics, or even trigger custom logic based on events. Each action is specific to a strategy and the time frame it's running in, allowing for tailored responses to what's happening. To register an action, you’ll provide an action schema – a configuration object that tells the framework what to do when certain events occur.
