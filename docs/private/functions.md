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

The `writeMemory` function lets you store data within a specific memory location, essentially creating a labeled container for information relevant to your trading strategy. This function is designed to be flexible, allowing you to store any kind of object as a value. 

It automatically handles whether you're running a backtest or a live trading session and seamlessly integrates with the current trading signal. You provide the function with a bucket name (think of it as a top-level folder), a unique ID for the memory location within that bucket, the actual data you want to store, and a descriptive label to help you remember what’s inside. Once called, the data is persisted, associating it with the signal.


## Function warmCandles

The `warmCandles` function helps speed up backtesting by pre-loading historical candle data and storing it for quick access. It downloads all the candles for a specified time period, from a start date (`from`) to an end date (`to`), using a particular interval (like 1-minute, 5-minute, daily). This is especially useful when you're working with large datasets or need to avoid repeatedly fetching data during a backtest, which can make the process significantly faster. You provide a set of parameters to control which candles to download and where to store them.

## Function waitForReady

This function ensures that all necessary components are fully loaded and ready before you begin trading, whether you're running a backtest or a live trading session. It waits for the registries that define the rules and data for trading – covering exchange, frame (historical data), and strategy – to become available.

During a backtest, it verifies that all three – exchange, frame, and strategy – are registered. However, for live trading, only the exchange and strategy are required, as historical data isn’t needed.

This is particularly helpful when you’re using features that load these components asynchronously, like lazy imports or plugins. The function pauses your program’s startup until everything is ready to avoid errors later. If it can't find all the necessary components after a reasonable wait, it won't throw an error itself; instead, it allows the subsequent trading attempt to fail with a more informative error message.

You can control this behavior by setting `isBacktest` to `true` for backtesting mode or `false` for live trading mode.


## Function validate

This function checks if all the things your trading system references – like exchanges, strategies, and risk managers – are actually set up correctly. 

It’s like a final check before you start running tests or optimizations.

You can tell it to check specific parts of your system, or let it do a full check of everything.

It remembers the results of previous checks to speed things up. 

This helps prevent errors later on by making sure everything's registered and ready to go.

## Function stopStrategy

This function allows you to pause a trading strategy's signal generation. 

It effectively tells the strategy to stop creating new trading signals. Any currently active signal will finish its lifecycle. Whether the backtest or live trading mode stops immediately or waits for a safe point (like an idle state or signal closure) is handled automatically. To halt a strategy, you simply provide the trading symbol you're working with.

## Function shutdown

This function lets you safely end the backtesting process. It sends a signal that tells all parts of the system to clean up and prepare for closing. Think of it as a polite way to stop the backtest, allowing everything to finish properly before the program ends, like when you receive a signal to terminate.

## Function setSignalState

This function lets you update and store a specific piece of data related to a trading signal. It's designed to work with the framework's understanding of whether you're in a backtesting or live trading environment. 

It automatically handles managing the active trading signal, ensuring it's correctly resolved during execution. If there isn’t an active signal, you’ll get a warning.

This function is particularly useful for advanced strategies, like those using AI, that want to track metrics like how long a trade is open or its maximum profit/loss. Think of it as a way to build up a detailed history of how each trade performs.

You provide the trading symbol, a way to send the data (either the data itself or a function for sending), and a description of what data you're starting with. The function then promises to return the updated data.


## Function setSessionData

The `setSessionData` function lets you store information that's specific to a trading setup – a particular symbol, strategy, exchange, and timeframe. Think of it as a place to hold temporary data that needs to be remembered between candles or even if the program restarts while running live.

It's perfect for things like keeping track of calculations from a complex indicator or results from an AI model – anything that needs to be available across multiple candles without being directly tied to a signal.

You can also use it to clear out old data by setting the value to `null`.

The function automatically figures out whether it's running a backtest or live trading, so you don't need to worry about that.

The function takes the trading symbol and the data you want to store. The data can be any object or you can clear the data by setting it to null.

## Function setLogger

You can now control how backtest-kit reports information by providing your own logger. This allows you to direct log messages to a file, a database, or any other destination you prefer. The framework will automatically add useful details to the log messages, like the trading strategy, exchange, and symbol involved, so you have all the context you need. To use your own logger, simply provide an object that conforms to the `ILogger` interface when you call the `setLogger` function.

## Function setConfig

This function lets you adjust the overall settings for the backtest-kit framework. You can change things like how data is handled or how calculations are performed. The `config` object lets you pick and choose which settings you want to modify, you don't need to change everything at once.  There's also a special `_unsafe` flag, which is mainly used for testing and allows you to bypass some of the usual safety checks.

## Function setColumns

This function lets you customize the columns that appear in your backtest reports, like the ones generated in markdown format. It's like tweaking the layout of a spreadsheet – you can change which data points are shown and how they’re displayed. You provide a set of new column configurations, and the system will adjust accordingly, ensuring everything is structurally sound. There's an "unsafe" option for advanced testing scenarios where you might want to bypass these validations, but generally, it's best to stick with the standard validation process.

## Function searchMemory

The `searchMemory` function helps you find related memory entries based on a search term. Think of it as a way to quickly locate information stored in your memory system.

It uses a sophisticated search method called BM25 to rank the memory entries by how well they match your search query.

You provide the function with a bucket name to specify where to look and a search query.

The function handles the details of determining whether the system is in backtest or live mode and finds the appropriate signal, so you don’t have to worry about those things.

It returns a list of matching memory entries, each with a unique ID, a score indicating how well it matches, and the content of the memory entry itself. You can then use this data to inform decisions or actions within your trading strategy.


## Function runInMockContext

The `runInMockContext` function lets you execute code as if it were running within a backtest or live trading environment, but without actually needing a full backtest setup. Think of it as creating a temporary, controlled environment for testing or exploring how your code interacts with backtest-kit's context features.

You provide a function you want to run, and it will execute within a pre-configured or custom-defined environment that includes things like the exchange name, strategy name, and trading symbol.

This is particularly helpful for testing code that relies on things like the current timeframe or other context-dependent information.

If you don't specify certain details like the exchange or timeframe, it will use some basic placeholder defaults to get you started.


## Function removeMemory

This function lets you delete a specific memory entry associated with a signal. Think of it as cleaning up old data related to how your trading strategy learned. 

It automatically figures out whether you're running a test backtest or a live trade. You simply provide the name of the "bucket" (where the memory is stored) and the unique ID of the memory entry you want to remove. It handles any necessary steps related to the current signal's execution.


## Function readMemory

The `readMemory` function helps you retrieve data that’s been previously stored in your trading system’s memory. Think of it as reaching into a labeled container to get a specific piece of information. It uses a unique identifier (`memoryId`) and a container name (`bucketName`) to pinpoint exactly what you're looking for.

This function is smart, too – it figures out whether your system is running a backtest or live trading and handles the currently active signal automatically, so you don’t have to worry about those details. It’s a convenient way to access previously saved data within your trading logic. 

You’ll need to provide the name of the memory container (the `bucketName`) and the specific identifier for the data you want to retrieve (the `memoryId`). The function then returns the data in a format you specify with a type definition.

## Function overrideWalkerSchema

This function lets you tweak an existing walker configuration, which is used for comparing different strategies. Think of it as making small adjustments to a pre-existing setup rather than creating a whole new one. You provide a partial configuration – only the parts you want to change – and the function merges that with the original configuration, leaving everything else untouched. This is helpful for fine-tuning comparisons without rewriting everything from scratch.


## Function overrideStrategySchema

This function lets you tweak a trading strategy that's already been set up within the backtest-kit framework. Think of it as a way to make small adjustments, like updating specific parameters, without having to redefine the entire strategy from scratch.

You provide a new set of configuration details – just the parts you want to change – and the framework will merge them with the existing strategy's settings, leaving everything else untouched. It’s a convenient tool for refining your strategies over time. 

The function returns a promise that resolves to the updated strategy schema.

## Function overrideSizingSchema

This function lets you adjust an existing position sizing strategy within the backtest kit. Think of it as tweaking a configuration you’ve already set up, rather than creating a brand new one. You only need to specify the settings you want to change; everything else will remain as it was. This is helpful for making small adjustments to your sizing logic without rewriting the entire thing. It returns a promise that resolves to the modified sizing schema.

## Function overrideRiskSchema

This function lets you tweak existing risk management settings within the backtest-kit framework. Think of it as a way to make small adjustments to a risk profile you've already set up, rather than creating a whole new one. You provide a partial configuration – just the things you want to change – and it updates the existing risk schema, leaving everything else untouched. It's handy for fine-tuning your risk controls without rewriting the entire setup.


## Function overrideFrameSchema

This function lets you tweak the details of how your data is structured for backtesting, specifically for a particular timeframe. Think of it as making small adjustments to an existing plan rather than starting from scratch. You provide a partial configuration – only the parts you want to change – and the function updates the original timeframe’s configuration accordingly, leaving everything else untouched. It's a helpful way to fine-tune your backtesting setup.

## Function overrideExchangeSchema

This function lets you modify existing exchange data sources within the backtest-kit. Think of it as a way to tweak how the framework understands and interacts with a specific exchange. It doesn't replace the entire exchange setup, but rather updates only the parts you specify.

You provide a piece of the exchange configuration – essentially, just the bits you want to change – and it blends that in with the existing setup. Everything else stays as it was.

It’s helpful when you need to adjust details like data endpoints or formatting without starting from scratch.

## Function overrideActionSchema

This function lets you adjust how an action (like a buy or sell order) is handled within the backtest. It's a way to change specific parts of an existing action's configuration without completely replacing it.

Think of it like tweaking a setting on a piece of equipment rather than swapping it out entirely.

You can use this to modify how actions behave in different environments, like development versus production, or to update the logic used for those actions. It’s particularly handy when you want to refine an action’s behavior without needing to make bigger changes to your overall strategy.

The function takes a partial configuration object – only the settings you want to change need to be included. Any other settings on the original action remain as they were.


## Function listenWalkerProgress

This function lets you keep track of how a backtest is progressing, especially when running multiple strategies. It gives you updates after each strategy finishes executing within the backtest. Importantly, these updates are handled one at a time to avoid any issues with how your tracking code runs. You provide a function that will be called with information about each strategy’s completion. When you're done tracking, the function returns another function that you can use to unsubscribe from these progress updates.

## Function listenWalkerOnce

The `listenWalkerOnce` function lets you monitor the progress of a trading simulation and react to specific events. Think of it as setting up a temporary alert – it listens for events that match your criteria, executes a function once when a match is found, and then automatically stops listening. This is great when you need to perform an action based on a single, particular condition happening during a backtest.

You define what kind of event you're interested in with `filterFn`, which is a function that decides whether an event is relevant. Then, you provide a callback function `fn` – this is the code that will run when a matching event is detected. Once that callback runs, the listener automatically shuts itself down.


## Function listenWalkerComplete

This function lets you be notified when a backtest run, initiated by `Walker.run()`, is finished. It's a way to know when all your trading strategies have been tested.

The notification happens as an event, and it ensures that any actions you take in response to that event happen one at a time, even if your response involves asynchronous operations. Think of it as a reliable signal that the whole backtesting process is done, processed neatly in order. To use it, you provide a function that will be called when the backtest is complete and that function receives information about the completed backtest event.


## Function listenWalker

This function lets you track the progress of your backtest as each strategy finishes running. Think of it as a way to listen for signals as your backtest moves through its steps.

It provides events that are sent one after another, ensuring that your code processing those events runs in a controlled, sequential order. 

You provide a function that gets called for each event, and this function will be executed after each strategy completes within the `Walker.run()` process. This allows for asynchronous processing of events without worrying about unexpected concurrency issues. The function you provide returns another function to unsubscribe from the listener when you no longer need it.

## Function listenValidation

The `listenValidation` function lets you keep an eye on potential problems during the risk validation process, which happens when your trading signals are being checked. 

It's like setting up an alert that triggers whenever a validation check throws an error.

You provide a function that will be called whenever an error occurs, and this function will receive details about the error.

This function is designed to help you identify and fix any issues with your risk validation setup, allowing for safer and more reliable trading. The alerts are handled in a specific order, and the process is designed to avoid running multiple checks at the same time.


## Function listenSyncOnce

This function lets you listen for specific synchronization events and react to them just once. It's like setting up a temporary observer that only fires when a particular condition is met. 

The `filterFn` determines which events are interesting to you – only those that pass this test will trigger the callback.

The `fn` is the function that will run when a matching event occurs.  Crucially, if this function is asynchronous (returns a promise), the backtest kit will pause until the promise resolves before proceeding. This is super handy for ensuring your trading system stays in sync with external processes.

Finally, `warned` is a flag used internally and doesn't usually need to be modified.  

The function returns a function you can call to unsubscribe from the event, effectively removing your listener.

## Function listenSync

The `listenSync` function lets you react to signals as they’re being synchronized, particularly when dealing with external systems or processes that take time. It's like having a way to step in and make sure everything is in agreement before a trade actually happens. If you provide a function (`fn`) that returns a promise, the trading system will pause and wait for that promise to resolve before continuing, ensuring synchronized operations. The `warned` parameter is currently not used.


## Function listenStrategyCommitOnce

This function lets you react to specific strategy changes happening within your trading system, but only once. You provide a rule – a filter – that defines which changes you’re interested in. When a matching change occurs, a function you provide is executed to handle it. Crucially, after that single execution, the function automatically stops listening, so you don't have to manage unsubscribing yourself. This is great for things like waiting for a strategy to be initialized or updated before proceeding with other actions.

It takes two pieces of information: a filter to identify the relevant changes, and a function to perform when one of those changes occurs. The filter determines which events you'll respond to, and the function defines what happens when a matching event is detected. The function returns another function that can be called to unsubscribe from the events.

## Function listenStrategyCommit

This function lets you keep an eye on what's happening with your trading strategies – specifically, changes to signals like canceling scheduled actions, closing positions, or adjusting stop-loss and take-profit levels. You provide a function that gets called whenever one of these events occurs.

It’s designed to handle these events reliably, even if your callback function takes some time to run, ensuring everything happens in the right order and doesn't interfere with each other. Think of it as a way to react to important updates in your strategy's management.

The function returns another function that you can call to unsubscribe from these events. This helps to keep your application clean and avoids unnecessary processing.


## Function listenSignalOnce

This function lets you listen for specific trading signals and react to them just once. It’s like setting up a temporary alert.

You tell it what kind of signal you're looking for using a filter, and then provide a function to run when that signal appears.

Once the signal is found and your function runs, the alert automatically goes away, so you won’t be bothered by it again. This is handy for things like waiting for a particular market condition to arise.

The `filterFn` defines the criteria for the signal. The `fn` executes when a matching signal is detected.


## Function listenSignalNotifyOnce

This function lets you react to specific trading signals just once. 

You tell it what kind of signal you're looking for using a filter—a function that checks if a signal matches your criteria. Then, you provide a callback function that will run *only once* when a matching signal arrives. After that single execution, the listener automatically stops, so you don’t have to manage unsubscribing yourself.


## Function listenSignalNotify

This function lets you keep track of what's happening with your trading strategy's signals. Whenever your strategy sends out a signal note – a little message about an open position – this function will notify you. 

The notifications are handled in the order they're received and processed one at a time, even if your notification handling code takes some time. This ensures things stay organized and prevents conflicts. 

Essentially, it's a way to get updates about your strategy's signal notes, ensuring they’re delivered reliably. You provide a function that will be called whenever a new signal note is available.


## Function listenSignalLiveOnce

This function lets you temporarily listen for specific trading signals coming directly from a live trading simulation. 

You provide a filter – essentially a rule – to determine which signals you're interested in, and then a function to execute when a matching signal arrives.

The key thing is that it only runs once and then automatically stops listening, so you don’t have to worry about cleaning up your subscriptions. It’s perfect for quick checks or short-lived actions based on real-time data during a live run.


## Function listenSignalLive

This function lets you tap into live trading signals generated by backtest-kit. You provide a function that will be called whenever a new signal event happens during a live run (signals from `Live.run()`). The events are delivered one at a time, in the order they arrive, so you can reliably process them. When you’re finished listening for these signals, the function returns another function that you can call to unsubscribe.

## Function listenSignalBacktestOnce

This function lets you temporarily listen for specific events generated during a backtest run. It's designed to react to events just once and then stop listening automatically. 

You provide a filter – a test to determine which events you're interested in – and a callback function that will execute when a matching event occurs. The callback will only run for the first event that passes the filter, after which the subscription ends. This is useful for quickly grabbing a single piece of information during a backtest without needing to manage ongoing subscriptions.


## Function listenSignalBacktest

This function lets you hook into the backtest process and receive updates as it runs. Think of it as subscribing to a stream of data generated during a backtest. 

You provide a function that will be called whenever a signal event happens during the backtest. This function receives information about each event, like the results of a trading decision.

Importantly, these updates are delivered in the order they happened, and processed one at a time, ensuring you don't miss anything. This is specifically for events coming from a `Backtest.run()` execution. 

The function returns another function that you can call to unsubscribe from these updates later, cleaning up your subscription when you're done.

## Function listenSignal

The `listenSignal` function lets you receive updates about your trading strategy's activity, such as when a trade is opened, active, or closed. It’s designed to handle these events one at a time, even if the function you provide to process them takes some time to complete.

This ensures that events are processed in the order they arrive and prevents any conflicts that might arise from running multiple things at once.

You provide a function that will be called whenever a signal event occurs, and this function receives information about the event, like the trade's details. The `listenSignal` function returns another function which you can use to stop listening to these events at any point.


## Function listenSchedulePingOnce

This function lets you react to specific ping events, but only once. It's like setting up a temporary listener that triggers a callback when a certain condition is met, then quietly disappears afterward. You provide a filter to determine which events you're interested in, and then a function to execute when a matching event occurs. This is handy when you need to react to a single occurrence of a particular event and don’t want to manage a persistent subscription. 

It's a one-time deal - once the event matches your filter and the callback runs, the listener is automatically removed. 

The `filterFn` defines what constitutes a matching event.
The `fn` is the action that happens when a matching event is detected.


## Function listenSchedulePing

`listenSchedulePing` lets you keep an eye on scheduled signals as they wait to become active. It's like setting up a notification system that triggers every minute while a scheduled signal is being monitored.

You provide a function that gets called each time a "ping" event occurs, allowing you to track the signal's lifecycle and build custom monitoring behaviors.

Essentially, it helps you react to the ongoing status of signals that haven’t yet started trading. The function you provide will be executed asynchronously, meaning your code won't block while handling the ping.  When you're done listening, the function returns another function that you can call to unsubscribe from these ping events.

## Function listenRiskOnce

This function lets you monitor risk-related events, but only once. It's like setting up a temporary alert – you specify a condition (using `filterFn`), and when that condition is met, a specific action (`fn`) is executed just one time. After that, the monitoring stops automatically, so you don't have to remember to turn it off. This is handy when you need to react to a particular risk event and then move on.

You provide a function (`filterFn`) that determines whether an event should trigger the action, and then another function (`fn`) that will be executed when the event matches your condition. The function returns another function that can be called to unsubscribe.


## Function listenRisk

The `listenRisk` function lets you be notified whenever a trading signal is blocked because it doesn't meet the defined risk criteria.

Think of it as a way to react specifically to signals that are being rejected, not just any signal that’s being processed.

It’s designed to prevent you from being overwhelmed with notifications; you only hear about the problems.

The events are handled one at a time, in the order they arrive, even if your reaction involves asynchronous operations, ensuring things proceed smoothly and without conflicts.

You provide a function that will be called whenever a risk rejection occurs, and this function receives information about the rejected signal. The function you provide will return a function that unregisters the listener.

## Function listenPerformance

The `listenPerformance` function lets you keep an eye on how your trading strategies are performing. It's like setting up a listener that will notify you whenever operations within your strategy take a measurable amount of time. This is really helpful for finding slow parts of your code that might be dragging down overall performance.

The data it provides, called `PerformanceContract` events, is processed in order, ensuring that even if your callback function takes some time to run, the events are handled correctly and sequentially. It uses a special queue to handle this processing safely, so you don’t have to worry about things getting out of sync. You just need to give it a function that will be called whenever a performance event occurs.


## Function listenPartialProfitAvailableOnce

This function lets you set up a one-time alert for when a specific partial profit level is reached in your trading strategy. You provide a condition (a filter function) to define what kind of profit event you're looking for. Once that condition is met, a callback function you specify will run once, and then the alert automatically goes away. It's a great way to react to a particular profit target without constantly monitoring for it.


## Function listenPartialProfitAvailable

This function lets you keep track of your trading progress as you reach different profit milestones, like 10%, 20%, or 30% gains. It's like setting up alerts for when you hit those targets. 

The system ensures that these alerts are handled one at a time, in the order they arrive, even if the process of handling the alert takes some time. This helps prevent issues that might arise from trying to deal with multiple alerts simultaneously.

You simply provide a function that will be called whenever a partial profit milestone is reached, and that function will receive information about the event. You can then unsubscribe from these events whenever you no longer need them.


## Function listenPartialLossAvailableOnce

This function lets you set up a temporary listener for partial loss events – it's perfect when you need to react to a specific condition just once and then stop listening. You provide a filter to identify the exact type of loss event you’re interested in, and a function that will run when that event occurs. After the function executes, the listener automatically disappears, so you don’t have to worry about cleaning it up manually. Think of it as a 'wait for this, then do something' mechanism.


## Function listenPartialLossAvailable

This function lets you keep an eye on when your trading strategy hits certain loss levels, like 10%, 20%, or 30% of its total capital. It sends you notifications whenever these milestones are reached. 

The important thing is that these notifications are handled one at a time, in the order they arrive, even if your notification processing takes some time. This helps prevent issues that can happen when multiple notifications try to run at the same time.

You provide a function that gets called with details about the partial loss event.


## Function listenMaxDrawdownOnce

This function lets you monitor for specific maximum drawdown events in your trading backtest. You provide a filter to identify the exact drawdown conditions you’re interested in, and then a function that will execute *just once* when that condition is met. After that single execution, the monitoring stops automatically. It's a simple way to react to a particular drawdown event and then forget about it. The filter allows you to focus on the conditions that truly matter for your strategy.

## Function listenMaxDrawdown

This function lets you monitor a trading strategy's maximum drawdown – essentially, how far its value has dropped from its peak. 

It sets up a listener that will notify you whenever the strategy hits a new record low in terms of drawdown. 

Importantly, the notifications are handled in order and one at a time, even if your notification code takes a while to complete. 

This is really helpful for keeping tabs on potential risks and adjusting your strategy accordingly. You provide a function to be executed whenever a new maximum drawdown is detected.

## Function listenIdlePingOnce

This function helps you react to specific "idle ping" events—basically signals about periods of inactivity in your application. It allows you to set up a filter to only respond when certain conditions are met, and then execute a function once when that event occurs. Think of it as a way to perform a quick action or check something when the application is quiet, but only the first time a matching idle ping comes along. Once the function executes, the subscription is automatically removed.


## Function listenIdlePing

This function lets you get notified when your backtest kit isn't actively monitoring any signals – it's essentially "idle." Think of it as a way to know when things are quiet and no trades are pending.

You provide a function that will be called whenever this idle state occurs.

The function you provide receives an `IdlePingContract` object, which contains details about the idle ping event.

When you’re done needing these idle notifications, the function returns another function that you can call to unsubscribe and stop receiving them.


## Function listenHighestProfitOnce

This function allows you to react to a specific, highest-profit trading event just once. Think of it as setting up a temporary alert – you provide a condition (like a certain profit level), and when that condition is met, your provided function runs and then the alert automatically disappears. It's really handy when you need to take action based on a unique situation and don't want to keep monitoring afterwards.

You give it two things: a way to identify the event you're interested in and the action you want to take when that event occurs. After the action is performed once, it stops listening.

## Function listenHighestProfit

This function lets you keep track of when a trading strategy reaches a new peak profit. It's like setting up a notification system that alerts you whenever the strategy's profit goes up to a new high. 

The notifications are handled in a specific order, even if the callback you provide takes some time to complete. 

To avoid issues with your callback running at the same time, it uses a system that queues the processing. This is helpful if you want to record these profit milestones or dynamically adjust your trading strategy based on how well it’s performing. You provide a function that will be called whenever a new highest profit is achieved.

## Function listenExit

The `listenExit` function lets you set up a listener for those really serious errors that cause the backtest or other background processes to completely stop. 

It's different from handling regular errors – this is for the critical ones that bring everything to a halt.

Think of it as a safety net for when things go severely wrong.

The function ensures that when an error occurs, your callback function is executed in a controlled and sequential manner, even if that function itself takes some time to run. This prevents a flurry of actions and keeps things orderly when dealing with a fatal error. The listener is automatically removed when you no longer need it, providing a clean way to monitor for these kinds of problems.


## Function listenError

The `listenError` function lets you set up a listener that will catch any errors that happen while your trading strategy is running – errors that are expected and can be recovered from. Think of it as a safety net for minor bumps in the road. These errors might be things like a temporary API connection problem.

When an error occurs, the function will call the callback you provide.  Crucially, it handles these errors one at a time, in the order they happen, making sure things don’t get out of control. This ensures that even if your error handling routine takes some time, it won't interfere with other parts of your strategy.


## Function listenDoneWalkerOnce

This function lets you react to when a background task finishes, but only once. You provide a filter to specify which completion events you're interested in, and a function that gets called when a matching event happens. After that one execution, it automatically stops listening, so you don't have to worry about cleaning up your subscription. Think of it as a quick and easy way to respond to a single event from a background process.


## Function listenDoneWalker

This function lets you monitor when background tasks within a trading strategy have finished running. It's designed for situations where you need to react to the completion of these tasks, ensuring they finish in the order they were started.

You provide a callback function (`fn`) that will be triggered when a background task is done. This callback will receive information about the completed task.

Importantly, the framework handles the order of these completion notifications and prevents multiple callbacks from running at the same time to avoid issues with asynchronous operations. The function returns a cleanup function that you can call to unsubscribe from these completion events.


## Function listenDoneLiveOnce

This function lets you react to when background tasks within your backtest finish, but only once. It's designed for situations where you need to know when a specific background process is complete and you don't need to keep listening for further completions.

You provide a filter to specify which completed tasks should trigger the response, and then a function to run when the filtered task finishes. After the function executes, it automatically stops listening, ensuring it doesn't interfere with other parts of your backtest. This simplifies cleanup and prevents unintended behavior.


## Function listenDoneLive

This function lets you listen for when background tasks managed by Live are finished. 

Think of it as a way to be notified when a long-running process in your backtest completes.

The callback you provide will be executed in order, ensuring that any asynchronous operations within it won't interfere with each other. It prevents multiple callbacks from running simultaneously. To use it, simply pass a function that will handle the completion event – this function will receive information about the completed task.

## Function listenDoneBacktestOnce

`listenDoneBacktestOnce` lets you react to when a background backtest finishes, but it's special because it only triggers your code *once*. You provide a filter that determines which backtest completions you're interested in, and then a function that runs when a matching backtest is done. After that single execution, it automatically stops listening, so you don't have to worry about managing subscriptions yourself. It’s ideal for actions you only want to perform once after a specific backtest completes.


## Function listenDoneBacktest

This function lets you be notified when a backtest finishes running in the background. It’s useful if you need to perform actions after a backtest is complete, like saving results or updating a UI. 

The notifications happen one after another, even if your callback function takes some time to execute. This ensures that things happen in the right order and prevents any unexpected problems from multiple callbacks running at once. You provide a function that will be called when a backtest is done, and this function returns a way to stop listening for those notifications later.


## Function listenBreakevenAvailableOnce

This function lets you set up a listener that reacts to changes in breakeven protection, but only once. You provide a filter that defines what kind of changes you're interested in, and a function to run when that specific change happens. After the function runs once, the listener automatically stops, preventing further callbacks. It's great for situations where you need to respond to a particular breakeven event just one time.

The `filterFn` determines which events will trigger your callback.
The `fn` is the function that gets executed when a matching event is detected.


## Function listenBreakevenAvailable

This function lets you keep an eye on when your trades reach a breakeven point – that's when the price moves enough to cover all your transaction costs and get you back to your original entry price.

It sends you notifications whenever a trade's stop-loss is automatically adjusted to breakeven.

Importantly, it handles these notifications in a controlled way, ensuring that even if your notification code takes some time to run, everything happens one step at a time. This helps prevent any unexpected issues.

You provide a function that will be called each time a breakeven event occurs, and it will return an unsubscribe function to stop receiving events.

## Function listenBeforeStartOnce

This function lets you set up a listener that reacts to events happening right before a backtest starts, but only once. It’s designed for actions you want to perform just a single time before the simulation kicks off. You provide a filter to specify which events you're interested in, and a function that will execute once when a matching event is detected. After that single execution, the listener automatically shuts itself off, so you don't have to worry about manual cleanup.

It’s useful for initializing something specific or performing a one-time check before the backtest begins.


## Function listenBeforeStart

This function lets you hook into the moment right before a trading strategy begins running for a specific asset. Think of it as a chance to prepare things – perhaps adjust settings or gather data – just before the strategy kicks off. The system makes sure your preparation code runs one step at a time, even if it takes a bit of time to complete, ensuring things stay orderly. You provide a function that gets called with information about the upcoming strategy execution, giving you details about what's about to happen. When you’re done listening, you can unsubscribe using the function that's returned.

## Function listenBacktestProgress

This function lets you keep tabs on how your backtest is running. It sets up a listener that gets notified as the backtest progresses, sending information about the current state. 

Think of it as a way to get updates, especially useful if your backtest involves a lot of calculations or data. The updates are delivered one after another, even if your code needs a little extra time to process them. This ensures things stay in order and prevents any unexpected conflicts. You provide a function that will be called whenever a progress update is available, and this function will receive data describing the current stage of the backtest. You can unsubscribe from these updates when you are finished.

## Function listenAfterEndOnce

This function lets you react to specific events that happen after a trading simulation finishes, but only once. You provide a filter—a way to identify which events you're interested in—and a callback function that will be executed just one time when a matching event occurs. Once the callback runs, the subscription is automatically removed, so you don't have to worry about manually cleaning up. It's perfect for things like logging a summary statistic after a backtest completes or performing a single action based on the final result.


## Function listenAfterEnd

The `listenAfterEnd` function lets you be notified when a trading strategy's execution for a particular asset is fully finished. It’s like setting up a listener that gets triggered after the engine has wrapped up its work on a symbol.

This listener uses a special queuing system, so even if your callback function takes time to process (maybe it's doing some calculations), the events are handled one after another in the order they arrive. This prevents things from getting messy with multiple callbacks running at the same time.

You provide a function (`fn`) that will be called with details about the completed execution whenever this event occurs. When you are done listening, the returned function lets you unsubscribe.


## Function listenActivePingOnce

This function lets you set up a one-time alert for specific active ping events. It listens for events that meet your criteria, defined by a filter, and when it finds a matching event, it runs your provided function once and then stops listening. Think of it as a way to react to a specific condition appearing in your active ping data and then forgetting about it. You provide a filter to identify the events you're interested in and a function to execute when that event is found.


## Function listenActivePing

This function lets you keep track of active signals in your backtest. It listens for events that are sent out every minute, providing information about the status of active signals. 

Think of it as a way to monitor the lifecycle of your signals and potentially adjust your trading strategies based on that information.

The events are handled one after another, and even if your callback function takes some time to complete (like if it’s doing something asynchronous), it won't interfere with the processing of other events. You just provide a function that will be called whenever a new active ping event occurs, and this function will handle the event data.

## Function listWalkerSchema

This function provides a way to see all the different trading strategies (walkers) that have been set up within the backtest-kit system. Think of it as a directory listing of your available trading approaches. It returns a list that you can use to inspect their configurations or dynamically display them in an application. It’s handy when you're troubleshooting, creating documentation, or building interfaces that need to know about the available trading methods.


## Function listStrategySchema

This function lets you see a complete inventory of all the trading strategies you've set up within the backtest-kit framework. It essentially gives you a list of all the strategies that are ready to be used for backtesting. Think of it like checking your toolbox to see what strategies are available. You can use this to verify your setup, create helpful documentation, or build user interfaces that show users what strategies they can choose from.


## Function listSizingSchema

This function lets you see all the sizing strategies currently set up in your backtesting environment. It's a handy way to check what's going on behind the scenes – perfect for troubleshooting or building tools that need to know about these sizing configurations.  Essentially, it gives you a list of all the ways your orders are being sized.


## Function listRiskSchema

This function lets you see all the risk configurations currently set up within your backtesting environment. Think of it as a way to peek under the hood and understand the risk controls that are in place. It gathers all the risk schemas that were previously added using `addRisk()`. You can use this to check your settings, generate documentation, or build user interfaces that respond to the configured risks. The function returns a promise that resolves to an array of risk schemas.

## Function listMemory

This function helps you retrieve a list of stored memories associated with the current trading signal. It's like looking through a history log for your trades. 

The function automatically figures out which signal it's working with and whether you’re in a backtesting or live trading environment. 

You need to provide a `bucketName` which identifies the specific collection of memories you want to see.

The function returns an array, with each item representing a memory, containing a unique identifier (`memoryId`) and the memory content itself, which can be of any object type.

## Function listFrameSchema

This function lets you see a complete list of all the data structures – we call them "frames" – that your backtesting system is set up to handle. Think of it as a way to explore what kinds of data your backtest can work with. It's super helpful when you’re trying to figure out exactly how your backtest is organized, creating helpful displays, or just generally debugging things. The function returns a list of these frame schemas, providing you with a clear overview of your data structure setup.

## Function listExchangeSchema

This function provides a way to see all the exchanges your backtest-kit setup recognizes. It essentially gives you a list of all the different trading platforms you’ve told the system about. You can use this to check if your exchanges are configured correctly, create helpful documentation, or build user interfaces that adapt to the available exchanges. It returns a promise that resolves to an array of exchange schema objects.

## Function hasTradeContext

This function helps you determine if your code is running in an environment where it can safely interact with the trading exchange. Specifically, it verifies if both the execution and method contexts are currently active. 

Think of it as a safety check: before you try to fetch data like candle information, get prices, or format numbers related to a trade, use this function. If it returns `true`, you're good to go; if it returns `false`, you need to ensure the necessary contexts are established first to prevent errors.

## Function hasNoScheduledSignal

This function helps you quickly check if a trading signal is currently scheduled for a specific asset, like "BTCUSDT". It returns `true` if no signal is planned, which is useful when you're building systems that generate signals and need to avoid conflicts or unexpected behavior. It cleverly figures out whether you’re running a backtest or a live trading environment, so you don't have to worry about explicitly setting that. 

You can think of it as the opposite of `hasScheduledSignal` – if you need to be absolutely certain a signal isn't already in place before creating a new one, this is your go-to tool.

It takes the symbol of the trading pair as input, for example, "BTCUSDT" or "ETHUSD".


## Function hasNoPendingSignal

This function checks if there’s an active, waiting signal for a specific trading pair. It’s basically the opposite of `hasPendingSignal`; it tells you if no signal is currently waiting to be triggered. You can use it to make sure your system doesn't try to create new signals when one is already in progress. It figures out whether you're running a backtest or a live trading session automatically, so you don't have to worry about that. You just need to give it the symbol of the trading pair you want to check.

## Function getWalkerSchema

The `getWalkerSchema` function helps you find the blueprint for a specific trading strategy, or "walker," within your backtesting setup. Think of it as looking up the detailed instructions for how a particular strategy should operate. You provide the name of the strategy you’re interested in, and the function returns a structured description of its workings – what data it needs, what actions it can take, and so on. This allows you to understand and potentially modify how a strategy is implemented. It's useful for inspecting existing strategies or for building tools that interact with them programmatically.


## Function getTotalPercentClosed

This function, `getTotalPercentClosed`, helps you understand how much of a trading position remains open. It tells you the percentage of the original position that hasn't been closed out – a value of 100 means you still hold the entire initial position, while 0 means it's completely closed. 

It intelligently considers any dollar-cost averaging (DCA) entries you've made when calculating this percentage. 

To use it, simply provide the trading pair symbol, and it will return the percentage. It figures out whether it's running in a backtest or live environment automatically.

## Function getTotalCostClosed

This function helps you figure out how much you've spent on a specific cryptocurrency or asset you currently own. It calculates the total cost in dollars, even if you've bought it in smaller chunks over time (Dollar-Cost Averaging) and partially closed your position. It takes the symbol of the asset as input, like 'BTC/USDT'. The framework will automatically determine whether it's running a backtest or live trading environment.

## Function getTimestamp

This function provides a way to get the current timestamp within your trading strategy. It’s useful for tracking time-based events or calculating durations. 

When running a backtest, it will give you the timestamp associated with the specific historical timeframe being analyzed. 

If you're running in live trading mode, it returns the current, real-time timestamp.

## Function getSymbol

This function lets you find out what symbol you're currently trading within the backtest environment. It's a simple way to know which asset your trades are related to. The function returns a promise that resolves to the symbol as a string, so you can easily use it in your code.

## Function getStrategySchema

The `getStrategySchema` function helps you find the blueprint for a specific trading strategy you've registered within the backtest-kit framework. It takes the unique name of the strategy as input. 

Think of it like looking up a recipe by its name – this function gives you the detailed instructions (the schema) that defines how that strategy operates. This schema contains important information like the inputs the strategy needs and the functions it uses. It’s useful for validating or inspecting a strategy's configuration.


## Function getSizingSchema

This function lets you fetch the details of a specific sizing strategy you've defined within your backtesting setup. Think of it as looking up the rules and parameters that govern how much of your capital is allocated to each trade. You provide the name of the sizing strategy, and it returns a structured object containing all the relevant information, like how the size is calculated. It’s useful when you need to dynamically adjust or examine a sizing strategy during your backtest analysis.


## Function getSignalState

This function helps you retrieve a specific value associated with a trading signal. It figures out which signal is currently active based on the environment it's running in.

If no active signal is found, it will give you a default value you provide and also log a message to let you know.

This is particularly useful for strategies that track metrics for each trade, like how long a trade stays open or its maximum gain, to optimize your approach over time. It's designed with a certain trading style in mind, focused on managing risk and aiming for consistent, moderate profits while avoiding significant losses. The function needs a trading symbol and a set of configurations to work properly.

## Function getSessionData

This function lets you retrieve information that's specifically linked to a trading symbol and persists even when the backtest or live session restarts. Think of it as a place to store temporary data—like results from complex calculations or state information—that you want to reuse across different candles within a trading session. It's like having a little notebook for each symbol where you can jot down notes that stick around. This function automatically adapts to whether you're in backtest mode or live trading.

You simply provide the trading symbol you're interested in, and it returns the associated data if it exists, or null if nothing is stored.

## Function getScheduledSignal

This function lets you fetch the scheduled trading signal that’s currently in effect for a specific trading pair. It's like checking what the system is planning to do next based on a pre-defined schedule. If there isn't a signal scheduled, it will tell you that by returning null. The function is smart enough to know whether it's running a backtest or live trading, so you don't need to worry about that detail. You just need to provide the symbol of the trading pair you're interested in, like 'BTCUSDT'.

## Function getRiskSchema

This function helps you access predefined templates for analyzing risk in your trading strategies. Think of it as looking up a specific blueprint for how to measure and understand a particular type of risk. You provide a unique name identifying the risk you’re interested in, and it gives you back the structure and information needed to evaluate it. This allows for consistent and standardized risk assessment across different backtesting scenarios.


## Function getRawCandles

This function helps you retrieve historical price data (candles) for a specific trading pair. 

You can easily fetch a limited number of candles, or pull data within a defined date range. 

The function intelligently handles date calculations when you provide only a start or end date, and always ensures the data fetched won't look into the future, preventing biased results. 

Here's a breakdown of how it works:

*   You specify the trading pair (like "BTCUSDT") and the timeframe (like "1m" for one-minute candles).
*   You can optionally limit the number of candles you want, or provide both a start and end date.
*   If you only provide a start date, it will calculate the end date based on your desired limit. 
*   If you only provide an end date, it will calculate the start date.
*   If you only specify a limit, it will use the current execution time as the starting point.

## Function getPositionWaitingMinutes

getPositionWaitingMinutes lets you check how long a planned trading signal has been waiting to be put into action. It's useful for understanding if there are any delays or issues with your automated trading.

You provide the trading pair symbol, like "BTCUSDT," and the function will return a number representing the waiting time in minutes.

If no signal is currently scheduled for that symbol, the function will return null.

## Function getPositionPnlPercent

This function helps you understand how your open positions are performing financially. It calculates the percentage profit or loss on your current, pending trades, taking into account factors like partial closes, averaging in (DCA), slippage, and trading fees. 

If you don't have any pending trades, it will return null. 

The function smartly figures out whether you’re running a backtest or a live trading session, and it also gets the latest market price for you. To use it, you simply need to provide the trading pair symbol, like 'BTCUSDT'.

## Function getPositionPnlCost

This function helps you determine the unrealized profit or loss, in dollar amounts, for a trading position that's currently waiting for a signal. It essentially figures out how much money you've potentially gained or lost based on the difference between your entry price and the current market price.

The calculation considers a lot of real-world factors like partial trades, dollar-cost averaging, potential slippage, and any trading fees.

If there isn't a pending signal for the specified trading pair, the function will return null.

You don't need to worry about setting up the environment or fetching prices; this function handles it automatically based on whether you’re running a backtest or a live trade, and it grabs the current market price for you. You just provide the trading pair's symbol.


## Function getPositionPartials

This function allows you to see how your position has been partially closed, whether for taking profits or limiting losses. It provides a list of events detailing these partial closures, showing exactly when and at what percentage they occurred. 

You’ll find information like the execution price, the cost basis at the time of each partial, and the number of DCA entries included in that partial. 

If there's no active trade signal, the function will return null. If partial closures haven’t happened yet, you’ll receive an empty list instead. It requires the trading pair symbol to identify the position.

## Function getPositionPartialOverlap

This function helps you avoid accidentally closing out portions of your position at the same price level multiple times. It checks if the current market price falls within a small range around any previously executed partial close prices.

Essentially, it prevents redundant trades by ensuring you don't repeatedly close parts of a position within the same price tolerance.

You provide the symbol and the current price, and it will tell you if a partial close is likely to be a duplicate.  You can also customize the allowable range around the partial close price using the optional `ladder` parameter, which lets you specify the percentages used to calculate the tolerance zone. If no partial closes have been executed, or if no signals are pending, it will return false.

## Function getPositionMaxDrawdownTimestamp

getPositionMaxDrawdownTimestamp lets you find out exactly when a specific trading position hit its lowest point, marking its maximum drawdown. It gives you the timestamp of that unfortunate moment, helping you understand the risk profile of your trades. If a position hasn't been established yet, it won’t provide a timestamp and will return null. You need to specify the trading pair symbol (like BTC-USDT) to get this information.

## Function getPositionMaxDrawdownPrice

This function helps you understand the potential risk of a specific trade you've made. It calculates the lowest price a position has hit since it was opened, essentially showing you the biggest drop it's experienced. This can be useful for assessing how much a trade has lost value at its worst point.

If there isn't a currently active trading signal for the symbol, the function won't return any value.

You provide the trading pair symbol, like "BTCUSDT", and it will return a number representing that maximum drawdown price.


## Function getPositionMaxDrawdownPnlPercentage

This function helps you understand the performance of a specific trading position. It calculates and returns the maximum drawdown in percentage terms based on the profit and loss (PnL) of that position. Think of it as showing you the lowest point in profitability experienced by the position since it started. 

If no trading signals are currently active for the position, the function will return null. You need to provide the symbol (like 'BTC-USDT') of the position you want to analyze.

## Function getPositionMaxDrawdownPnlCost

This function helps you understand the financial impact of your trades. It calculates the total cost in terms of your quote currency (like USD or EUR) associated with the point where your position reached its lowest value. Think of it as figuring out how much money you lost at your biggest drawdown.

It needs the symbol of the trading pair (like BTC/USD) to work. 

If there isn't a current signal for a trade, it won't be able to provide a result and will return null.

## Function getPositionMaxDrawdownMinutes

This function helps you understand how far back in time your position experienced its biggest loss. It calculates the number of minutes that have passed since the point where your position reached its lowest value. Think of it as a way to gauge how long ago things were at their worst. If the loss was very recent, the number will be close to zero. It won't provide a value if there are no pending trading signals. You need to specify the trading pair symbol to get the drawdown information.

## Function getPositionLevels

getPositionLevels helps you understand the price levels at which your automated trading system has entered positions. It provides a list of prices used for dollar-cost averaging (DCA) entries related to a specific trading pair, like BTC/USDT. 

The first price in the list is always the initial entry price.  If you've added subsequent prices using commitAverageBuy, those will follow. 

If there's no active trade signal, this function returns null. If a trade exists but no DCA has been performed, it will return an array containing only the initial entry price.  You simply pass in the symbol of the trading pair you're interested in to see these prices.


## Function getPositionInvestedCount

getPositionInvestedCount lets you check how many times a position has been adjusted with DCA (Dollar-Cost Averaging) for a specific trading pair. 

A value of 1 means the position started with just the initial buy. Each time you use commitAverageBuy to lower your average buy price, this number goes up by one. 

If there's no ongoing trading signal for that pair, it will return null.

The function figures out if it's running in a backtest or live trading environment automatically.

You only need to pass in the trading symbol, like 'BTCUSDT'.

## Function getPositionInvestedCost

This function helps you figure out how much money is tied up in a trading position. It calculates the total cost basis, which includes all the expenses associated with entering that position. Essentially, it adds up all the entry costs that were recorded when the position was initially established. 

If there's no active position being tracked, it will return null. The function works seamlessly whether you're running a backtest or a live trading scenario, automatically detecting the environment it’s in. To use it, you simply provide the trading symbol, like "BTCUSDT," and it will tell you the total invested cost for that particular trading pair.

## Function getPositionHighestProfitTimestamp

This function helps you find the exact moment a specific trade (position) reached its highest profit. 

It looks at a particular trading pair, like 'BTC-USDT', and tells you the timestamp - essentially, a date and time - when that trade was at its most profitable.

If there’s no ongoing trade for that symbol, it will return nothing. You provide the symbol of the trading pair you're interested in, and the function returns a timestamp (a large number representing a specific point in time).


## Function getPositionHighestProfitPrice

This function helps you understand how well a trade is performing by finding the highest price it reached while moving in a profitable direction. 

It essentially keeps track of the best moment for a long position (when the price went up) or a short position (when the price went down) since the trade began. 

The function requires you to specify the trading pair, like "BTCUSDT". It always provides a value – it won't be empty – and that value will include at least the initial entry price of the trade.


## Function getPositionHighestProfitMinutes

This function tells you how long ago a trading position reached its highest profit point. 

It essentially measures the time since the position’s peak performance. 

Think of it as a way to see how far a position has fallen from its best moment. 

The value will be zero if you run the function right at the instant the peak profit was achieved. 

It needs a trading pair symbol (like BTCUSDT) to work. 

If no signals are pending for a given symbol, it will return null.

## Function getPositionHighestProfitDistancePnlPercentage

This function helps you understand how far your trading position has moved from its best profit point. It calculates the difference between the highest profit percentage achieved so far and the current profit percentage.

Essentially, it tells you how much room you potentially have for improvement, or how much you’ve fallen from a peak.

If there's no active trading signal for a particular symbol, the function won't be able to provide this data. 

You just need to give it the trading pair symbol (like "BTCUSDT") to get the result.

## Function getPositionHighestProfitDistancePnlCost

This function helps you understand how far your trading position is from its best possible profit. It calculates the difference between the highest profit achieved so far and your current profit, but only considers the positive difference (so it won't show a loss). Think of it as a measure of how much headroom you still have to potentially reach your peak profit. If no trading signals are pending, it won't be able to calculate this distance. You need to provide the trading pair symbol, like 'BTC-USDT', to use the function.

## Function getPositionHighestProfitBreakeven

This function helps you check if a trade position could have reached a breakeven point at its highest potential profit. It essentially tells you if, mathematically, it was possible to avoid a loss at the most profitable level for that trade.

If there's no active trading signal for a particular trading pair, the function will indicate that by returning null.

You provide the trading pair symbol, like "BTCUSDT," and the function will analyze the position to determine if breakeven was achievable at the highest profit level.

## Function getPositionHighestPnlPercentage

This function helps you understand how well a specific trading position performed. 

It tells you the highest percentage profit that position ever achieved, based on when it reached its best profit point. 

Think of it as finding the peak of a mountain – it shows you the absolute best return you could have seen at any point during that trade.

You need to provide the trading symbol (like BTC-USDT) to get this information.

If there's no trading signal currently associated with the position, the function won't be able to provide a value and will return null.


## Function getPositionHighestPnlCost

This function helps you understand the maximum cost incurred while trying to achieve the highest profit for a specific trading pair. It looks back at the position's history and finds the point where profits were at their peak, then calculates the cost associated with reaching that level. If there's no active signal for that pair, the function won't return anything. You provide the trading pair symbol, such as "BTCUSDT", to get this information.

## Function getPositionHighestMaxDrawdownPnlPercentage

This function helps you understand the risk profile of a trading position. It calculates how far your potential profit is from its lowest point, expressed as a percentage. Essentially, it shows you the 'recovery' potential of the position, measuring the difference between your current profit and the largest loss experienced so far. If there’s no open trade for the specified symbol, the function will indicate this by returning null. You provide the trading pair symbol, such as BTCUSDT, to get the result for that specific trade.

## Function getPositionHighestMaxDrawdownPnlCost

This function helps you understand the potential risk in a trading position. It calculates how far your current profit or loss is from the lowest point it reached during a drawdown – essentially, how much "cushion" you have against previous losses. The result is a number representing this difference, showing the PnL cost between the current price and the lowest point. If there's no existing trading signal, the function won't return a value. You'll need to provide the trading pair symbol to get this information.

## Function getPositionEstimateMinutes

This function helps you figure out how long a trading position is expected to last. 

It looks at the current signal and tells you the estimated duration in minutes. 

Essentially, it’s showing you the timeframe originally planned for the position based on the signal's data.

If there's no ongoing signal, the function will return null. You just pass in the symbol of the trading pair you’re interested in.

## Function getPositionEntryOverlap

getPositionEntryOverlap helps you avoid accidentally making multiple DCA entries at roughly the same price. It checks if the current price is close enough to a previously defined DCA level, allowing you to prevent unnecessary trades. The function returns true if the price is within a defined tolerance range around any of your existing DCA levels, and false if no such levels exist. You provide the trading symbol and the current price it's checking; optionally, you can customize the tolerance range used to determine closeness.

## Function getPositionEntries

getPositionEntries lets you see the details of how a trade was built up, especially when using dollar-cost averaging (DCA). It gives you a list of each price and the amount spent at each step – whether it was the initial buy or a later DCA commit. If there's no trade currently being set up, it will return nothing. If you did a single buy without any DCA, you'll get a list containing just one entry. You’ll need to provide the symbol of the trading pair to see its entries.

## Function getPositionEffectivePrice

This function helps you understand the average price you've effectively paid for a position in a specific trading pair. It calculates a weighted average, considering any previous trades and incorporating any DCA (Dollar Cost Averaging) entries.

Essentially, it gives you a more accurate picture of your entry price than just the initial price.

If there are no pending signals currently open, the function will return null. It figures out if you're running a backtest or a live trading session automatically. You just need to provide the symbol of the trading pair you're interested in, such as "BTCUSDT".

## Function getPositionDrawdownMinutes

getPositionDrawdownMinutes tells you how long a trade has been losing ground since it hit its best profit point. 

It essentially tracks the time elapsed since the peak profit for a specific trading pair. 

The value starts at zero when a trade first becomes profitable, and increases as the price moves lower. 

If there isn't an active trade for that symbol, the function will return null. You provide the trading pair symbol (like BTCUSDT) to get the drawdown time for that particular position.

## Function getPositionCountdownMinutes

getPositionCountdownMinutes lets you check how much time is left until a trading position expires. 

It calculates this by looking at when the position was initially flagged and comparing that to an estimated expiration time.

If the estimated time has passed, it returns 0, meaning the position is considered expired.

You’ll provide the trading pair's symbol (like "BTC-USDT") to get the countdown for that specific position.

If no pending signal exists for the provided symbol, the function returns null.

## Function getPositionActiveMinutes

This function helps you understand how long a particular trade has been running. It tells you the number of minutes a position has been open, giving you a sense of its duration. 

If there’s no signal currently waiting for execution, this function won't be able to provide a value and will return null.

You provide the trading symbol, like "BTCUSDT," and it returns the active minutes for that specific position.

## Function getPendingSignal

This function lets you check if your trading strategy has an existing signal that’s waiting to be executed. It retrieves the details of that signal, if one exists. If nothing is pending, it will tell you with a null value. It figures out whether it’s running a backtest or a live trade automatically. You just need to provide the trading pair, like "BTCUSDT", and it will handle the rest.

## Function getOrderBook

This function lets you retrieve the order book for a specific trading pair, like BTCUSDT. It pulls the data from the exchange you’re connected to.

The function automatically considers the current time when fetching the order book, which is important for accurate backtesting or live trading. You can specify how many levels of the order book you want to retrieve; if you don't specify a depth, it will use a default maximum. Essentially, it gives you a snapshot of the current buy and sell orders for the chosen trading pair.

## Function getNextCandles

This function helps you grab a batch of future candles for a specific trading pair and timeframe. It's like asking the exchange for the next few candles that will be available after the current time. You tell it which symbol you're interested in (like BTCUSDT), the interval (like 15 minutes), and how many candles you want to retrieve. The function then uses the exchange's built-in tools to get those candles, making it easier to plan your trading strategies. 


## Function getMode

This function simply tells you whether your trading strategy is currently running in backtest mode or live trading mode. It's a quick way to check if you're simulating trades with historical data or actually executing trades with real money. The function returns a promise that resolves to either "backtest" or "live".

## Function getMinutesSinceLatestSignalCreated

This function helps you figure out how much time has passed since the last trading signal was generated for a specific asset, like "BTC-USDT". It's handy for things like making sure you wait a certain amount of time before placing another trade after a stop-loss is triggered. 

It checks your historical trading data first, then looks at any recent live data available, and will tell you the time in minutes. If there's no record of any signals for that asset, it will simply return null. The function automatically understands whether it's operating on past backtest data or current live data. 

You just need to provide the symbol of the trading pair you’re interested in.

## Function getMaxDrawdownDistancePnlPercentage

This function helps you understand the risk profile of a trading strategy by calculating the maximum drawdown. It essentially measures the largest percentage drop from the highest point of profit to the lowest point of loss experienced by a position. 

The result is a positive number representing this peak-to-trough difference, or zero if there's no significant fluctuation. If there’s no signal to evaluate, the function will return null. You provide the trading pair symbol (like "BTCUSDT") as input to specify which strategy's drawdown to analyze.

## Function getMaxDrawdownDistancePnlCost

This function helps you understand the risk associated with a trading strategy by calculating the maximum drawdown. It measures the difference between the highest profit achieved and the lowest point of loss. Essentially, it tells you the largest potential loss you could have experienced from the peak profit. 

The function takes the trading symbol, like "BTC-USDT", as input.

It returns a number representing that maximum drawdown distance in profit and cost. If no trading signals are available, the function will not return anything.


## Function getLatestSignal

This function helps you find the most recent trading signal – whether it's still active or has already finished. It doesn't care if the signal was a winner or loser; it just gives you the very last one recorded.

Think of it as a way to pause your trading for a bit, like after a stop-loss order is triggered. You could use this to ensure a new trade doesn't open until a certain amount of time has passed, no matter what happened with the previous trade.

It looks for the signal in your historical data first, and then in the live data if it doesn't find anything there. If no signal exists for the specified trading pair, it will return nothing. It automatically figures out if it's running in backtest or live mode, so you don't have to worry about that.

You just need to tell it which trading pair’s signal you're looking for.

## Function getFrameSchema

The `getFrameSchema` function lets you look up the details of a specific frame that's been set up in your backtest. Think of it like finding the blueprint for a particular part of your trading system. You provide the name of the frame, and it returns information describing how that frame is structured and what it does. This is useful when you need to understand or interact with a frame's properties programmatically. 


## Function getExchangeSchema

This function lets you fetch the details of a specific exchange that backtest-kit knows about. Think of it as looking up the blueprint for how a particular exchange works, including what assets are available and how orders are handled. You provide the name of the exchange you're interested in, and it returns a structured object containing all the necessary information. This is helpful for understanding how the framework interacts with different exchanges during backtesting.

## Function getDefaultConfig

This function gives you a set of default settings for the backtest-kit framework. Think of it as a starting point – a template of all the configuration options you can tweak. It's useful for understanding what's possible and what values are used if you don’t set anything yourself. The returned settings cover things like how often the system checks for new data, limits on the number of signals, and flags to enable or disable certain features.

## Function getDefaultColumns

This function provides a convenient way to access the standard set of columns used for generating reports in the backtest-kit framework. Think of it as a template for building your report layout.

It returns a configuration object containing predefined columns for different data types, such as closed trades, heatmap data, live ticks, partial fills, breakeven events, performance metrics, risk events, scheduled events, strategy events, synchronization events, highest profit events, maximum drawdown events, walker profit data, and strategy results.

You can use this to inspect the available column options and understand how they are structured, which helps in customizing your own reporting configurations. Essentially, it's a starting point for defining how your trading data will be presented in reports.


## Function getDate

This function gives you the current date, and it behaves differently depending on whether you're running a backtest or live trading. When backtesting, it provides the date associated with the timeframe you're analyzing. If you're in live mode, it returns the actual, real-time date. Essentially, it's a convenient way to know what date you're working with in your trading logic.

## Function getContext

This function gives you access to the current method's environment. Think of it as a way to peek at what's happening behind the scenes during a specific step in your backtest. It returns an object holding details relevant to the current method's execution, like its state and other helpful information.

## Function getConfig

This function lets you peek at the framework's global settings. 

It gives you a snapshot of all the configuration values, like how often things are checked, limits on data, and whether certain features are turned on or off.  

Think of it as reading the instruction manual for the backtest system. The values you get are a copy, so changing them won’t affect the running system.

## Function getColumns

This function lets you peek at the columns being used to build your backtest reports. It provides a snapshot of the configurations for different data types, like closed trades, heatmap rows, live ticks, and more. Think of it as getting a read-only copy of the report's building blocks, so you can understand how your data is being presented without risking any changes to the underlying system. It's particularly useful for understanding or debugging your report's structure.

## Function getClosePrice

This function helps you fetch the closing price of the most recent candle for a specific trading pair and timeframe. Think of it as getting the final price recorded for a particular period of trading activity. You'll need to provide the symbol of the trading pair, like "BTCUSDT" for Bitcoin against USDT, and the timeframe you’re interested in, such as "1h" for an hourly candle. The function will then return that closing price as a number. 


## Function getCandles

This function allows you to retrieve historical candle data, also known as OHLC data (Open, High, Low, Close), from a connected exchange. You provide the trading pair you're interested in, like "BTCUSDT," the time interval for the candles (e.g., "1m" for one-minute candles, "4h" for four-hour candles), and how many candles you want to pull back in time. The function will then fetch that data from the exchange’s system.

It’s useful for analyzing past price action and building trading strategies. The candles are retrieved starting from the current time and going backward.


## Function getBreakeven

This function helps determine if a trade has become profitable enough to cover associated costs. It takes the trading symbol and the current price as input. 

Essentially, it figures out if the price has moved favorably enough to recoup the costs of the transaction, like slippage and fees. The calculation considers a safety margin based on predefined percentages. 

The function intelligently adapts to whether it's running in a backtesting environment or a live trading scenario.


## Function getBacktestTimeframe

This function helps you discover the dates your backtest covers for a specific cryptocurrency pair, like BTCUSDT. It essentially tells you the start and end dates of the historical data being used for your backtesting simulation. You give it the symbol of the trading pair you're interested in, and it returns an array of dates representing the timeframe. This is useful for understanding the scope of your backtest and ensuring it aligns with your intended analysis period.

## Function getAveragePrice

This function helps you find the Volume Weighted Average Price, or VWAP, for a specific trading symbol like BTCUSDT. It looks at the last five minutes of price data, considering both the price and the trading volume.

Essentially, it calculates a type of average that gives more weight to prices where there was more trading activity. If there's no trading volume data available, it will fall back to a simpler average of the closing prices. You just need to provide the symbol of the trading pair you're interested in, and it will return the VWAP as a number.

## Function getAggregatedTrades

This function retrieves a list of combined trades for a specific trading pair, like BTCUSDT. 
It pulls this data from the exchange that's been set up in your backtest environment. 

By default, it will return trades from within a set timeframe.
You can also specify a `limit` to request only a certain number of the most recent trades. The function will keep fetching older trades until it gathers the number you requested.

## Function getActionSchema

This function helps you find the blueprint for a specific action within the backtest-kit system. Think of it as looking up the detailed instructions for how a particular trade or event should be handled. You give it the action's unique name, and it returns a description outlining what data the action needs and what it does. It's useful when you want to understand or validate the structure of a trading action.


## Function formatQuantity

This function helps you display the right amount of a cryptocurrency or asset when placing orders. It takes the trading pair symbol, like "BTCUSDT," and the raw quantity you want to trade, and then formats it correctly based on the rules of that specific exchange. This ensures that your order quantity displays the correct number of decimal places required by the exchange, avoiding potential errors and rejections. Basically, it handles the technical details of quantity formatting so you don’t have to.


## Function formatPrice

This function helps you display prices in the correct way for different trading pairs. It takes the symbol of the trading pair, like "BTCUSDT", and the raw price value as input. It then uses the specific rules of that exchange to format the price, ensuring it shows the right number of decimal places. This is really helpful for displaying accurate and user-friendly price information.


## Function dumpText

The `dumpText` function lets you save raw text data related to a specific signal. Think of it as a way to record details or observations during a trading simulation or live trading. 

It automatically figures out whether you're in a backtesting environment or a live trading scenario and uses the current signal that's already in progress. 

You provide the function with information like the bucket name, a unique ID for the data, the actual text content, and a brief description of what the data represents. The function then stores this information, making it available for review or analysis later.

## Function dumpTable

This function lets you output data from your backtest or trading simulation in a nicely formatted table. 

It takes an array of objects, essentially your data records, and displays them in a readable table format. 

The table headers are automatically generated based on all the different data fields present in your records, so you don’t need to define them yourself.

It's designed to work seamlessly within the backtest-kit framework, automatically understanding if you're running a backtest or a live trading simulation. The function also handles connecting this data to the signal, providing context for your results.


## Function dumpRecord

This function helps you save a simplified view of trading data—think of it as a snapshot—to a storage location. It's designed to capture information related to a specific trading signal. 

It automatically figures out whether you’re in a backtesting environment or a live trading scenario, simplifying the process for different modes of operation.

The data you provide is structured as a key-value record, and it’s linked to a unique identifier and a description. It does the work of identifying the signal to which the data belongs.


## Function dumpJson

The `dumpJson` function lets you record data as formatted JSON within your backtesting or live trading process. Think of it as a way to log important information, like trade details or portfolio snapshots, in a structured way.

It takes an object containing the bucket name, a unique dump ID, the actual JSON data you want to save, and a descriptive label. 

The function handles the complexities of managing signals automatically, working seamlessly whether you’re running a backtest or a live trade.  It ensures the JSON data is properly associated with the correct signal based on the current context.


## Function dumpError

This function helps you report and track errors that occur during backtesting or live trading. It takes error details like a bucket name, a unique dump ID, the actual error message, and a brief description. It automatically associates the error with the current trading signal and handles whether you're running a backtest or live trading environment, simplifying error management. This allows for organized error logging and analysis to improve trading strategies.


## Function dumpAgentAnswer

This function helps you save and review the detailed conversations your AI agent had during a trading simulation or live execution. It gathers all the messages exchanged with the agent, associating them with a specific dump ID and a descriptive label. 

Essentially, it's designed to give you a complete record of the agent's reasoning and actions, which is valuable for debugging, analysis, and understanding how the agent performed. The function intelligently figures out whether it's running in a test environment or a real-time trading situation, and it automatically identifies the relevant trading signal to link the data to.


## Function createSignalState

This function helps you manage and track the state of your trading signals in a structured way. It's particularly useful when you're building strategies that need to collect data over time, like those driven by AI or large language models. 

Think of it as creating a little container for your signal's data, automatically knowing whether it's running a backtest or a live trade.  You don't need to manually specify the signal ID; it figures that out for you.

The function returns two pieces: `getState` lets you retrieve the current signal data, and `setState` lets you update it.  It’s designed for strategies that accumulate metrics like peak profit or how long a trade has been open, to help determine when to exit a trade.

## Function commitTrailingTakeCost

This function lets you set a specific, absolute price for your trailing take-profit order. It simplifies the process by automatically calculating the necessary percentage shift based on your original take-profit distance. The framework handles the details of determining whether you're in backtesting or live trading and retrieves the current market price to ensure accuracy. You just provide the symbol you’re trading and the desired take-profit price.

## Function commitTrailingTake

The `commitTrailingTake` function lets you refine the placement of your take-profit orders for trades that are already set up. It's designed to help you manage your risk and potentially increase profits as a trade progresses.

Crucially, this function always calculates adjustments based on the original take-profit distance you set when the trade was initially opened, not any current, adjusted trailing take-profit. This helps to prevent errors from building up if you call this function multiple times. 

If you provide a smaller, more conservative percentage shift, it will always be applied—larger shifts will only move the take-profit closer to your entry price.

Think of it this way: negative shifts bring your take-profit closer to your entry price (safer), while positive shifts move it further away (more aggressive). The function automatically detects whether it’s being used in a backtesting or live trading environment. 

It works by automatically determining if the new TP is more conservative, and only changes it if it’s. For long trades, it will only move the take profit closer; for short trades, it will only move it further.


## Function commitTrailingStopCost

This function lets you change the trailing stop-loss price for a specific trading pair to a fixed price. It's a simplified way to set the stop-loss, handling the complexities of calculating the correct percentage shift from the initial stop-loss distance. It intelligently determines whether the system is in backtesting or live trading mode and automatically gets the current price to ensure the adjustment is accurate. You simply provide the trading symbol and the desired stop-loss price.

## Function commitTrailingStop

The `commitTrailingStop` function lets you fine-tune a trailing stop-loss order that's already in place. It's designed to keep your stop-loss distance consistently calculated from the initial stop-loss level, avoiding errors that can build up over time.

Think of it as a way to nudge your stop-loss further out or bring it closer to protect your profits. A negative percentage shifts it closer to your entry price, while a positive percentage moves it further away.

The function is smart about how it makes these adjustments; it only updates your stop-loss if the new position is actually more protective – meaning it creates a better safety net for your profit.  For long positions, it will only allow you to move your stop-loss further out. Conversely, for short positions, the stop-loss can only be moved closer to your entry point.

It handles whether you are running a backtest or live trading automatically, so you don't have to worry about that. You'll need to provide the trading pair’s symbol, the percentage adjustment you want to make to the original stop-loss distance, and the current price of that asset.

## Function commitSignalNotify

This function lets you send out informational notifications related to your trading strategy. Think of it as a way to leave notes about what your strategy is doing, like "RSI crossed a threshold" or "detected a volume spike."

It doesn't actually change your positions; it’s purely for providing extra information.

You can use it to trigger external alerts or keep a log of important events happening within your strategy.

The function automatically knows whether you're in backtest or live mode and pulls in details like your strategy name, exchange, and frame. It also automatically gets the current price for the symbol you're working with.

You provide the symbol of the trading pair (like "BTCUSDT") and, optionally, additional details in the payload to make your notification more specific.

## Function commitPartialProfitCost

The `commitPartialProfitCost` function lets you close a portion of your trading position when you've made a profit, based on a specific dollar amount. It’s a simpler way to manage partial exits; you tell it how much in dollars you want to close, and it handles the percentage calculation for you. This function works for both backtesting and live trading and automatically gets the current price to make the adjustments. To use it, you'll need to specify the trading symbol and the dollar amount you want to realize in profit.

## Function commitPartialProfit

The `commitPartialProfit` function lets you automatically close a portion of your open trade when the price moves in a profitable direction, essentially taking some profit along the way. You specify the trading symbol and the percentage of the trade you want to close. It handles whether you're running a backtest or a live trade, so you don't have to worry about that. This function is designed to help you manage risk and lock in profits as your trade progresses toward its target.


## Function commitPartialLossCost

This function lets you partially close a trade, taking a loss based on a specific dollar amount. It's a shortcut—it figures out the percentage of your position to close based on the dollar amount you provide. It’s designed to help you move towards your stop-loss price when the market is trending in that direction. The function handles whether you're running a backtest or a live trade and gets the current price for you, so you don't have to. You tell it the symbol of the trade and how much money you want to lose.

## Function commitPartialLoss

This function lets you partially close an open trading position when the price is moving in a way that triggers your stop-loss. It's designed to close a specific percentage of your current position. 

Essentially, it's a way to reduce your risk by automatically closing part of your trade when it's heading toward a loss, and it works seamlessly whether you're backtesting or trading live. You'll need to specify the symbol of the trading pair and the percentage of the position you want to close. This function will handle figuring out whether you’re in a backtest or live trading environment.

## Function commitClosePending

This function lets you cancel a pending trade signal, essentially removing it without interrupting your strategy's operation. Think of it as a way to retract a signal you might have generated but decided not to act on. Importantly, it doesn't affect any signals that are already scheduled or halt the strategy's ability to create new signals – everything continues as normal. The framework intelligently handles whether it's running a backtest or a live trading scenario.

You can optionally provide details like an ID and a note to document why you canceled the signal.


## Function commitCancelScheduled

This function lets you cancel a scheduled signal, essentially removing it from the queue, but without interrupting your trading strategy. It's useful if you want to discard a previously planned action, perhaps because market conditions have changed. The function doesn't affect any signals that are already active or prevent your strategy from creating new signals. It handles whether you're in a backtesting or live trading environment automatically.

You specify the symbol of the trading pair you're working with.  You can optionally add a payload, like an ID or a note, to help you track why the signal was cancelled.

## Function commitBreakeven

This function helps you automatically manage your stop-loss orders. 

It moves your stop-loss to the entry price – essentially making your position risk-free – when the price has moved favorably enough to cover any transaction costs and a small slippage allowance. 

Think of it as a way to lock in profits and protect against unexpected price reversals.

The function figures out whether it's running in a backtest or live trading environment on its own, and it gets the current price for you too. You just need to tell it the symbol of the trading pair you're interested in.


## Function commitAverageBuy

The `commitAverageBuy` function helps you add a new purchase to your dollar-cost averaging (DCA) strategy. Essentially, it records a buy order at the current market price for a specific trading pair.

It calculates the average price paid so far for the asset and lets other parts of your system know a new buy occurred via an event.

The function figures out whether you’re running a backtest or a live trading session and automatically retrieves the current market price. You just need to provide the trading symbol, and optionally, the cost associated with the transaction.


## Function commitActivateScheduled

This function lets you trigger a scheduled signal to fire immediately, bypassing the usual price condition. 

It’s useful when you want to proactively activate a trade based on something other than price, like a news event. 

You tell the system which trading pair you're working with and optionally provide a note to track the reason for early activation. The actual trade execution will still happen on the next tick during the backtest or live trading process. The framework will automatically figure out if it's running a backtest or a live trade.


## Function checkCandles

The `checkCandles` function is a quick way to verify if your historical candle data is already available and stored. It efficiently checks for the existence of candle data without downloading the entire dataset. This function uses the persist adapter to see if the necessary candles are present, using a targeted check for each expected timestamp, so it's very fast even with large datasets. If any candle is missing or misaligned, the function will report that the data isn't fully available.


## Function cacheCandles

The `cacheCandles` function is designed to make sure your trading system has the historical candle data it needs. It works by first checking if the data already exists, and if not, it downloads and saves the missing candles. 

It's like a safety net, ensuring that when you run backtests or trading simulations, you always have the necessary data available. The process includes a retry mechanism to handle potential hiccups during the data retrieval.

You'll need to provide details like the trading symbol, timeframe (interval), the start and end dates, which exchange the data comes from, and optional callbacks for progress monitoring during the initial check and warm-up phases.


## Function addWalkerSchema

This function lets you add a new "walker" to your backtest setup. Think of a walker as a way to run multiple different trading strategies against the same set of historical data. It allows you to easily compare how well each strategy performs, using a metric you define. To use it, you provide a configuration object that describes how this walker should operate during the backtesting process.

## Function addStrategySchema

This function lets you tell the backtest-kit about a new trading strategy you want to use. 

Think of it as registering your strategy so the system knows how to handle it.

When you register a strategy, the system checks to make sure everything is set up correctly, like the price data and any stop-loss or take-profit rules. 

It also prevents signals from being sent too rapidly and makes sure the strategy's data can be safely stored even if something unexpected happens during live trading.

You provide a configuration object, which defines all the details of your strategy.

## Function addSizingSchema

This function lets you tell the backtest-kit framework how to determine your trade sizes. It's all about defining your risk management rules. You provide a sizing schema, which outlines things like whether you're using a fixed percentage of your capital, a Kelly Criterion approach, or something based on Average True Range (ATR). It also allows you to set limits on your position sizes, ensuring you don't take on too much risk. Furthermore, you can even define custom logic for calculating position sizes using a callback function.

## Function addRiskSchema

This function lets you set up how your trading system manages risk. Think of it as defining the guardrails for your strategies. 

You can specify limits on how many positions you hold at once and even create custom checks to make sure your portfolio is healthy—considering things like correlations between assets. 

The cool part is that multiple trading strategies can share the same risk management settings, so you get a complete picture of overall risk and can even control the signals that are allowed to execute based on risk assessments. It helps prevent your strategies from getting out of control and helps ensure a more stable trading environment.


## Function addFrameSchema

This function lets you tell the backtest-kit about new timeframe generators you want to use. Think of it as registering a way to create the series of dates and times your backtest will run on.

You provide a configuration object that describes the timeframe – when the backtest starts and ends, how often the timeframe should update (daily, hourly, etc.), and how to handle special events related to those timeframes.

This is crucial for setting up the time dimension of your backtesting strategy.

## Function addExchangeSchema

This function lets you tell backtest-kit about a new data source for an exchange, like Binance or Coinbase. Think of it as registering the exchange so the framework knows where to find historical price data, how to display prices, and how to calculate things like VWAP (a common trading indicator). You need to provide an object describing that exchange – this object contains information about how to fetch data and format the information. It's essential for backtest-kit to be able to work with the specific exchange you're interested in.


## Function addActionSchema

This function lets you tell the backtest-kit framework about a new action you want to use. Think of actions as a way to react to things happening during a backtest – like when a signal is generated, or a trade hits a profit target.

They’re a flexible way to connect your backtesting environment to external services. You can use them to update a state management system, send notifications to a chat app, record events, or even trigger other custom logic.

Every time a backtest run executes, a new action instance is created and given access to all the important events, like signals and profit/loss milestones. To register a new action, you simply provide a configuration object describing what you want it to do.
