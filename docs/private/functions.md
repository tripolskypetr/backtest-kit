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

The `writeMemory` function lets you store data persistently within your trading strategy's memory. Think of it as saving a variable with a specific name (the `memoryId`) within a designated container (the `bucketName`). You’ll need to give it a name for the container (`bucketName`), a unique identifier for the memory itself (`memoryId`), the value you want to store (`value`), and a short explanation of what that value represents (`description`). This function handles the complexities of saving this data whether you're running a backtest or a live trade.


## Function warmCandles

This function helps prepare your backtesting environment by downloading and storing historical candle data. Think of it as a way to pre-load the data your strategies will need, so the backtest runs faster and more smoothly. It grabs all the candles for a specific time period, based on the interval you choose (like 1-minute, 5-minute, or daily), and saves them for later use. This avoids repeatedly fetching the same data during the backtest. You provide the start and end dates for the data you want to pre-cache.

## Function waitForReady

This function helps ensure everything needed to start trading is properly loaded before you begin. It waits until the necessary configuration pieces—schemas for exchanges, frames, and strategies—are ready.

Think of it as a safety net at the beginning of your trading process.

When running a backtest, it checks that all three—exchange, frame, and strategy—are loaded. However, if you're running a live trade, it only requires the exchange and strategy schemas because historical data (frames) aren't used.

It periodically checks for these registries, and it will wait for a maximum of a few seconds. If everything isn’t ready within that time, it moves on, trusting that any errors will be reported later when you try to actually run the trading process.


## Function validate

This function helps make sure everything is set up correctly before you run tests or optimizations. It checks if all the things your backtest needs – like exchanges, strategies, and risk models – actually exist and are registered.

You can tell it specifically which items to check, or let it check everything automatically.

Think of it as a quick check to catch any configuration errors early on, preventing headaches later. It remembers previous validation results to be faster too.

## Function stopStrategy

This function allows you to pause a trading strategy that’s currently running. It effectively tells the strategy to stop creating any new trading signals. 

Existing signals that are already active will still finish their course, but no new trades will be initiated.

Whether you're running a backtest or live trading, the system will stop the strategy at a point where it's safe to do so, usually when it's idle or after a signal has completed.

You just need to specify the trading pair symbol, and the function will take care of stopping the relevant strategy based on the current trading environment.

## Function shutdown

This function helps you safely end a backtesting run. It signals to all parts of the backtest system that it’s time to wrap up and clean up any resources they’re using. Think of it as a polite way to tell the backtest to finish, allowing everything to close properly before it stops. It’s often used when you need to stop the backtest, like when you press Ctrl+C.

## Function setStrategyPaused

This function lets you temporarily stop a trading strategy from opening new positions. Think of it like putting a strategy on hold. 

When a strategy is paused, it won't process new trade signals, but it will still manage any existing open positions and pending orders – they’ll continue to close as planned. New signals simply queue up and wait until you resume the strategy. 

This pause state is saved, so it remains active even if the system restarts. To get the strategy trading again, you'll need to specifically unpause it using `setStrategyPaused(symbol, false)`. Whenever a strategy is paused or resumed, the system will send out a notification (PauseContract event) so you know what's happening. The function knows whether it’s running a backtest or a live trading scenario automatically.


## Function setSignalState

The `setSignalState` function lets you update a specific value associated with a trading signal. It’s particularly useful when you're building strategies that need to track information on a per-trade basis, like how long a trade is open or its maximum gain.

This function automatically figures out whether you're running a backtest or a live trading session.

It handles finding the active trading signal for you, so you don't have to worry about that part. If no signal is active, it will alert you to the issue.

Think of it as a way to keep track of details about trades—things like how much the price moved, how long it stayed open—especially when using LLMs to create complex trading strategies. The strategies it's best suited for aim to keep losses small (around -0.5% to -2.5%) and maximize profits (up to 2% to 3%), with some trades designed to avoid any gains at all. A rule for exiting a trade might be based on how long it’s been open and its maximum percentage gain.

You’ll need to provide the trading pair symbol, a "dispatch" object, and a data transfer object containing the bucket name, the initial value, and other relevant information. The function then returns the updated value.


## Function setSessionData

This function lets you store information that lasts throughout a backtest or live trading session. Think of it as a place to hold data that needs to be remembered between candles, like results from complex calculations or the state of an indicator. 

It's tied to a specific trading pair (symbol) and automatically knows if it's running a backtest or live, making it simple to use in either scenario. 

You can set a value, or clear it out by passing `null`. It's perfect for keeping track of things that are important for making trading decisions across multiple candles.

## Function setLogger

You can now control where the backtest-kit framework sends its log messages. This function allows you to plug in your own logging system, like sending logs to a file, a database, or a centralized logging service.  The framework will automatically add helpful information to each log message, such as the trading strategy name, the exchange used, and the symbol being traded, so you have more context when analyzing performance or debugging issues.  Simply provide an object that conforms to the `ILogger` interface to this function, and the framework will use it for all logging.

## Function setConfig

This function lets you tweak how the backtest-kit framework operates. You can pass in a set of configuration options to change things like data handling or execution behavior.  It’s designed to be flexible, allowing you to provide only the settings you want to modify, rather than the entire configuration. There's also a special "unsafe" flag which allows you to bypass some of the safety checks - mainly used when running tests to avoid restrictions.

## Function setColumns

This function lets you customize the columns that appear in your backtest reports, like the ones generated for markdown. You can adjust the default column configurations to display exactly the information you need.

It’s like tweaking the layout of your report to highlight specific data points.

The function takes a configuration object where you can specify changes to the column settings. It verifies the structure of the provided configuration to prevent errors.

If you’re working in a testbed environment and need to bypass these validations, you can use the `_unsafe` flag.

## Function searchMemory

The `searchMemory` function lets you find relevant data stored in your memory system. Think of it as a smart search tool for your trading data. You provide a bucket name (where the data is stored) and a search query.

It uses a technique called BM25 to score how well each memory entry matches your query, returning a list of entries with their relevance score.

The function automatically figures out whether you're running a backtest or a live trading environment and will even resolve the current signal for you, simplifying your code.


## Function runInMockContext

This function lets you execute code within a controlled, simulated environment. It's especially handy for testing or creating scripts that rely on context-specific data like the current timeframe, without needing a full backtest setup.

Think of it as a sandbox where you can safely call functions that normally require a running backtest.

You can customize the "mock" environment to resemble specific trading conditions, but if you don't, it'll create a basic live-mode setup. This default setup uses placeholder names like "mock-exchange" and "BTCUSDT" and defaults to the current minute. You only need to pass the arguments you want to customize.

## Function removeMemory

This function lets you clear out a specific memory entry related to a signal. Think of it like deleting an old record from a history log. 

You'll need to provide the name of the memory 'bucket' and the unique ID of the memory entry you want to remove. 

It’s designed to work seamlessly whether you're running a backtest or a live trading session because it checks the execution context automatically. It will also handle resolving any pending or scheduled signals that might be affected by the removal.

## Function readMemory

The `readMemory` function lets you retrieve data stored in a memory location. Think of it as grabbing a value that’s been previously saved and associated with a specific identifier. It’s designed to work within the context of a trading signal, meaning it uses the current signal's details to find the right memory. 

This function is smart enough to know whether you’re in backtesting or live trading mode, so you don't need to worry about setting that up explicitly. You provide the name of the memory bucket and a unique ID to identify the specific item you want to retrieve, and it returns the data. The data will be returned as a generic type of object.


## Function overrideWalkerSchema

This function lets you modify a walker schema, which is used for comparing different strategies. Think of it as tweaking an existing plan instead of starting from scratch. You only need to specify the parts you want to change; everything else stays the same. It’s useful for making small adjustments to a strategy's evaluation setup.

## Function overrideStrategySchema

This function lets you modify a trading strategy that's already been set up in the backtest-kit framework. Think of it as making adjustments to an existing strategy, rather than creating a brand new one. You can specify just the parts you want to change – any settings you don't provide will stay as they were previously defined. It's a way to fine-tune your strategies without rewriting the whole thing.

The function takes a configuration object containing the updates you want to apply to the strategy.

## Function overrideSizingSchema

This function lets you tweak an existing position sizing strategy without completely replacing it. Think of it as making small adjustments to how much of your capital is allocated to trades. You provide a new set of settings, and only those settings will be applied to the original sizing configuration, leaving everything else untouched. This is useful for fine-tuning your strategy over time. The function returns a promise that resolves to the updated sizing schema.

## Function overrideRiskSchema

This function lets you tweak an existing risk management setup within the backtest-kit framework. Think of it as making targeted adjustments – you can update specific parts of a risk configuration without having to redefine the entire thing. It's helpful when you need to fine-tune parameters without a complete overhaul. Only the settings you provide will be modified; the rest of the risk configuration stays as it was. You’ll pass in a partial configuration object to specify what changes you want to apply.

## Function overrideFrameSchema

This function lets you tweak a timeframe's setup for your backtests. 

Think of it as modifying an existing blueprint instead of creating a whole new one. 

You provide a partial configuration – just the bits you want to change – and the function updates the timeframe's settings while keeping everything else as it was. 

This is helpful for adjusting things like data frequencies or aggregation methods without rebuilding the entire timeframe definition.


## Function overrideExchangeSchema

This function lets you modify an already-set-up data source for an exchange. Think of it as a way to tweak existing exchange settings rather than completely replacing them. You provide a set of changes – like updated symbol mappings or rate limits – and only those specific changes will be applied to the existing exchange configuration. The rest of the exchange's settings remain as they were. It’s useful for making adjustments to how your backtest kit interacts with a particular exchange without needing to redefine everything.


## Function overrideActionSchema

This function lets you tweak an existing action handler – think of it as making small adjustments to how your trading actions are handled. You can update specific parts of a handler’s setup without completely replacing it. This is handy for things like changing how events are processed, adapting to different environments like development versus production, or even swapping out the code that executes for a particular action. It’s a targeted way to modify behavior without needing to rewrite the whole strategy. You simply provide the changes you want to make, and only those fields will be updated.

## Function listenWalkerProgress

This function lets you track the progress of your backtest as it runs. It’s like having a notification system that tells you when each trading strategy finishes.

You provide a function as an argument, and this function will be called after every strategy completes within the backtest.

Importantly, these updates are handled one at a time to avoid any issues with unexpected behavior. This ensures the updates are processed reliably, even if your callback function takes some time to complete. The function returns a cleanup function that you should call to unsubscribe.

## Function listenWalkerOnce

`listenWalkerOnce` lets you react to specific events happening during a backtest, but only once. Think of it as setting a temporary alarm – it listens for events that meet your criteria, triggers a function once when it finds one, and then stops listening. This is perfect if you need to wait for a particular condition to occur during your backtest, like a specific price level being reached. You provide a filter to define which events you're interested in, and a function to execute when a matching event occurs. Once that first matching event triggers your function, the listener automatically disappears.

## Function listenWalkerComplete

This function lets you be notified when a backtest run finishes. 

It's useful for knowing when all your trading strategies have been tested.

The events are delivered one at a time, ensuring that any processing you do in response to the event happens in the correct order. To avoid overloading your system, it handles the callback in a way that prevents multiple operations from running at the same time. You provide a function that will be called when the backtest completes, and this function returns another function which can be called to unsubscribe from the event.


## Function listenWalker

The `listenWalker` function lets you keep an eye on how a backtest is progressing. It's like setting up a notification system that gets triggered after each strategy finishes running within a backtest. These notifications are handled one at a time, even if your notification code takes some time to process, ensuring things stay in order and prevent unexpected conflicts. You provide a function that will be called for each event, and the function will receive information about the strategy's completion. When you're done tracking the backtest, you can unsubscribe from these events using the function that `listenWalker` returns.

## Function listenValidation

This function lets you keep an eye on potential problems during the risk validation process, which happens when your trading signals are being checked. 

It’s like setting up a listener that gets triggered whenever a validation error occurs.

This is helpful for spotting and fixing issues early on, especially when things might not be working quite right.

The errors are delivered one at a time, even if the callback you provide takes some time to process, ensuring a smooth and controlled flow of error handling. It wraps the callback to make sure things happen in order and avoid unexpected behavior.


## Function listenSyncOnce

This function lets you set up a listener that reacts to specific synchronization events, but only once. Think of it as a one-time alert for a particular type of order update. If the listener encounters a problem – like the order being rejected or deleted – it will signal an error, potentially stopping the process.

You define a filter to determine which events trigger the listener. 

The function you provide will be executed once when a matching event occurs. If that function returns a promise, the system will pause until the promise resolves before proceeding.

## Function listenSync

The `listenSync` function allows you to monitor and react to events where signals are being synchronized, like when an order is being opened or closed. It’s designed to handle these events in a way that ensures proper synchronization, preventing issues that might arise from asynchronous operations.

Think of it as a gatekeeper for orders – if something goes wrong within your listener function, the order process will be rejected or retried.

Here's what you need to know:

*   **What it does:** It gives you a way to be notified whenever a signal needs synchronization.
*   **How it works:** The function you provide (`fn`) gets called when an event happens. If your function throws an error, the order will be handled according to specific rules (retries or immediate rejection).
*   **Error handling:** Different types of errors are treated differently. Transient errors (like temporary connection problems) trigger retries, while rejected errors immediately stop the process.
*   **Important note:**  This is not for general error reporting; it specifically relates to order synchronization.

## Function listenStrategyCommitOnce

This function lets you set up a temporary listener that reacts to specific strategy management events. You provide a filter to define which events you're interested in, and a function to execute when a matching event occurs. Once that one event happens, the listener automatically stops listening, preventing unwanted side effects. It’s handy when you need to respond to a single, specific action within a strategy. 

It takes two parts: a filter to pinpoint the event you want and a function to run when that event arrives. The listener stops working after it's triggered once.

## Function listenStrategyCommit

This function lets you keep an eye on what's happening with your trading strategy. It listens for events like signals being canceled, orders being closed, or stop-loss and take-profit levels being adjusted. 

Think of it as subscribing to updates on your strategy's actions.

When something changes, the provided function gets called, allowing you to react or log the event.  The system makes sure these events are handled one at a time, even if your function needs to do some processing. This helps avoid any conflicts or unexpected behavior.

You provide a function as an argument, and it returns another function to unsubscribe from these events when you no longer need to listen.


## Function listenSignalOnce

This function lets you react to a specific signal event just once and then automatically stops listening. You provide a filter to define which signals you're interested in, and a function to execute when that signal arrives. It’s handy when you need to wait for a particular condition to be met and then perform an action, after which you no longer need to monitor the signal. The function returns a way to unsubscribe from the signal manually if needed.


## Function listenSignalNotifyOnce

This function lets you react to specific trading signals, but only once. You tell it what kind of signal you’re looking for with a filter – it’s like setting up a specific search query. When a matching signal comes through, your provided function will be called just one time to handle it, and then it automatically stops listening, so you won’t get any more notifications for that specific signal type. It’s a convenient way to handle a one-off action based on a signal without needing to manage ongoing subscriptions.

## Function listenSignalNotify

This function lets you listen for notifications whenever a trading strategy sends a custom message related to an active trade. Think of it as a way to be informed about specific events triggered by the strategy, such as a note or comment associated with a position. 

The system ensures these notifications are processed one at a time, even if the function you provide to handle them runs asynchronously. This helps prevent any unexpected issues caused by multiple notifications happening at once.

You give it a function that will be called whenever a signal info event occurs, and it returns a function you can use to unsubscribe from these notifications later.

## Function listenSignalLiveOnce

This function lets you temporarily listen for specific trading signals coming directly from a live strategy run. Think of it as setting up a short-term alert.

You provide a filter – a way to choose which signals you're interested in – and a function that will be executed *once* when a matching signal arrives. Once that one event is processed, the listener automatically stops, so you don't need to manually unsubscribe. It's a quick and easy way to react to a particular signal during a live test.


## Function listenSignalLive

This function lets you subscribe to real-time trading signals generated during a live strategy execution. It's specifically designed to work with events coming from `Live.run()`.

You provide a function that will be called whenever a new signal event occurs. 

The events are delivered one at a time, ensuring that they are processed in the order they were received, allowing for sequential processing of updates. The function you provide will handle each event individually. The function returned by `listenSignalLive` can be used to unsubscribe.

## Function listenSignalEventOnce

This function lets you temporarily listen for specific lifecycle events within the backtest environment. You provide a filter to define what kind of event you're interested in, and a function to run when that event occurs.  Once the event is detected and your function runs, the listener automatically stops, so you don't have to worry about cleaning up. It's a quick and easy way to react to a single occurrence of a particular event, like waiting for an order to open or close.


## Function listenSignalEvent

This function lets you keep an eye on what’s happening with your trading signals. You can use it to react to signals being opened or closed, whether it’s due to a take-profit, stop-loss, or just the time running out.

It's designed to handle things in the order they happen, even if your reaction needs a bit of time to process. You provide a function that will be called whenever a signal opens or closes, giving you a heads-up about what's going on in your trading system, both in live and backtesting environments. This function also returns a function to unsubscribe the event listener.

## Function listenSignalBacktestOnce

This function lets you temporarily tap into the events generated during a backtest run, but only for a single event that meets your specific criteria. You provide a filter – a function that decides which events you're interested in – and a callback function that will be executed once when a matching event occurs. Once that single event triggers the callback, the subscription automatically ends, so you don't need to worry about manually unsubscribing. It's a quick and clean way to observe a particular signal during a backtest.


## Function listenSignalBacktest

This function lets you hook into the backtest process and react to events as they happen. It's like setting up an alert system for your backtest.

You provide a function that will be called whenever a signal event occurs during a backtest run initiated by `Backtest.run()`. These events are handled one at a time, ensuring they are processed in the order they arrive. This is useful for things like logging detailed information, displaying real-time progress, or building custom visualizations. When you’re done listening to these events, the function returns another function that you can call to unsubscribe.


## Function listenSignal

This function lets you listen for signals coming from your trading strategies, like when a trade opens, closes, or becomes active. It's designed to handle these signals one at a time, even if the code you write to process them takes some time to complete. Think of it as a way to ensure your strategy's actions happen in the order they're received, preventing any potential issues from multiple things happening simultaneously. You provide a function that will be called whenever a signal event occurs – that function will receive data about the event, such as the trade's result. This subscription is removable; the function returns another function you can call to unsubscribe and stop receiving these signal updates.

## Function listenSchedulePingOnce

This function lets you set up a temporary listener for ping events – think of it as waiting for a specific signal and reacting once. You define what kind of signal you're looking for using a filter, and then provide a function to execute when that signal arrives. Once the signal is received and your function runs, the listener automatically stops, preventing it from triggering again. It’s great for situations where you need to react to a particular event just once and then move on.


## Function listenSchedulePing

The `listenSchedulePing` function lets you keep an eye on scheduled signals as they wait to become active. It provides a way to receive notifications – essentially pings – every minute while a scheduled signal is being monitored. These pings give you a chance to track the signal's progress and implement any custom checks or actions you need during this waiting period. You provide a function that will be called whenever a ping event occurs, giving you the details of that specific ping. When you’re finished listening, the function returns another function that you can call to unsubscribe.

## Function listenScheduleEventOnce

This function lets you react to a specific scheduled event, but only once. You provide a filter to identify the event you're interested in, and then a function that will run when that event occurs. Once the event is triggered and your function has executed, the subscription is automatically removed, so you don't have to worry about managing it. It's a handy way to wait for a particular scheduled action to happen and then do something in response.

Here's a breakdown:

*   **filterFn:** This is like a "search term" that determines which events will trigger your action.
*   **fn:** This is the action, or function, that will happen *once* when a matching event is found.

## Function listenScheduleEvent

This function lets you keep track of what's happening with your scheduled trading signals. Specifically, it tells you when a signal is initially created or cancelled before it even gets activated.

You’ll receive notifications when a signal is “scheduled” and when it's cancelled, perhaps due to a timeout or because the price didn't meet your criteria or a user intervention. 

Keep in mind that this doesn't cover the point when a signal actually becomes active; that’s handled by the regular signal listeners. Your callback function will be called in the order events occur, even if your callback does asynchronous work.


## Function listenRiskOnce

This function lets you set up a listener that reacts to specific risk rejection events, but only once. You provide a filter to identify the events you're interested in, and a function to execute when a matching event occurs. After that single execution, the listener automatically stops listening, making it perfect for situations where you need to react to a condition just one time. It handles the subscription and unsubscription for you, simplifying your code.

## Function listenRisk

The `listenRisk` function lets you monitor when trading signals are blocked because of risk checks. 

It’s designed to only notify you when a signal is rejected, not when it's approved, which helps keep things clean and avoids unnecessary alerts.

This function ensures that these risk rejection events are handled one at a time, even if your processing involves asynchronous operations. 

You provide a function (`fn`) that gets called whenever a risk rejection event occurs, and `listenRisk` returns a function you can call to unsubscribe.

## Function listenPerformance

This function lets you keep an eye on how quickly different parts of your trading strategy are running. It sends out information about performance metrics as your strategy executes, like how long calculations or trades take. This is great for spotting slow areas that might be holding back your strategy. 

The events are delivered one after another, even if your callback function does some asynchronous work, and they are processed in the order they occur.  A special queuing system ensures your callback runs smoothly without any conflicts.

You provide a function that will be called whenever a performance event happens, and this `listenPerformance` function returns another function that you can call to unsubscribe from the performance updates.


## Function listenPauseOnce

This function lets you temporarily listen for changes in a trading system's paused state, but only once. You provide a condition – a filter function – that determines which state changes you're interested in. Once an event matches your condition, a callback function you define will run, and the listener will automatically stop. It's a quick way to react to a specific pause event and then move on.

## Function listenPause

The `listenPause` function lets you keep track of when a trading strategy is paused or resumed. It's designed to notify you whenever the strategy’s pause status changes—think of it as getting an alert when trading is temporarily stopped or started again.  This happens when the `setPaused` function is used to actually flip the pause flag, impacting new positions and signal closures. 

The function will queue your notifications so they are delivered in the order they happen, even if the callback you provide takes a bit of time to process. Essentially, it ensures that these pause/resume notifications happen reliably and without interfering with each other. You pass in a function that will be called whenever a pause or resume event occurs, and it returns a function to unsubscribe from these notifications when you’re done.

## Function listenPartialProfitAvailableOnce

This function lets you watch for specific profit levels being reached during a backtest, but only once. You provide a condition – a filter function – that defines when you want to be notified. Once that condition is met, a callback function you provide is executed, and then the listener automatically stops. It's great for scenarios where you only need to react to a profit condition happening just one time.


## Function listenPartialProfitAvailable

This function lets you set up a listener that gets notified when your trading strategy reaches certain profit milestones, like 10%, 20%, or 30% profit. 

When these milestones are hit, the listener will receive a notification, and importantly, these notifications are handled in the order they come in.

To ensure things run smoothly, the system makes sure your listener's code is processed one at a time, even if the listener involves asynchronous operations. This provides a reliable way to track and react to progress in your backtesting or trading strategy. You provide a function that will be called whenever a partial profit is achieved.


## Function listenPartialLossAvailableOnce

This function lets you set up a one-time alert for when a specific condition related to partial losses occurs. You provide a filter – a test to see if the event matches what you're looking for – and a function to run when that condition is met. Once the condition is detected, the function will execute your callback and automatically stop listening, so you only react to that single occurrence. This is handy for scenarios where you need to respond to a particular loss level just once.

## Function listenPartialLossAvailable

This function lets you keep track of how much a trading strategy has lost. It sends notifications when the strategy hits specific loss milestones, like 10%, 20%, or 30% loss. 

The notifications are delivered in the order they happen, and it makes sure the callback function you provide runs one at a time to avoid any conflicts.

You provide a function that gets called whenever a partial loss event occurs, and this function returns another function that unsubscribes the listener.

## Function listenMaxDrawdownOnce

This function lets you set up a listener that reacts to specific maximum drawdown events. You provide a filter to determine which events you're interested in, and a function to run when a matching event occurs. The key thing is, it's a one-time listener – it will execute the function just once and then automatically stop listening, which is handy for situations where you need to react to a condition just once and then move on. Essentially, it waits for a particular drawdown scenario and then acts.


## Function listenMaxDrawdown

This function lets you keep an eye on when your trading strategy hits new drawdown lows. It will notify you whenever a new maximum drawdown is recorded. 

Think of it as a way to be alerted whenever your strategy experiences a deeper loss than before.

The system handles things in order, even if your response to these alerts takes some time to complete. It makes sure that you process them one at a time, preventing issues from multiple notifications happening at once.

You provide a function that gets called whenever a new drawdown event occurs, allowing you to react to changes in your strategy’s performance.

## Function listenIdlePingOnce

This function lets you react to idle ping events – those signals that indicate the system hasn't been actively used for a while. It’s designed for actions you only want to run once when a specific condition is met. You provide a filter to determine which ping events you're interested in, and then a function to execute when a matching ping arrives. Importantly, the subscription is automatically canceled after the callback runs, so you don’t have to worry about cleaning it up. 

It receives two things: a way to select which idle ping events you care about and the action you want to perform when one of those events happens.


## Function listenIdlePing

This function lets you get notified whenever your backtest kit isn't actively processing any signals – essentially, when it's "idle." You provide a function that will be called each time this idle state occurs. This is useful if you want to perform tasks, like logging or system checks, only when there's no trading activity happening. The function you provide will receive an event object containing details about the idle ping. When you're done, you can unsubscribe to stop receiving these notifications.

## Function listenHighestProfitOnce

This function lets you react to specific, profitable trading events, but only once. Think of it as setting up a temporary alert – when a particular condition related to the highest profit achieved is met, your provided function will run, and then the alert is automatically removed. You define the condition by providing a filter function that checks the event details, and the function to be executed when the condition is true. This is great for scenarios where you need to respond to a single occurrence of a certain profit level.

## Function listenHighestProfit

This function lets you keep an eye on when your trading strategy reaches a new peak profit level. It's like setting up a notification system that tells you whenever a new highest profit is achieved. 

The notifications are delivered one at a time, even if the process of handling the notification takes some time. 

You provide a function that will be called whenever this milestone is hit, and this function will be executed sequentially to avoid any conflicts. This is helpful for tracking your strategy's performance and adjusting things on the fly.

## Function listenExit

The `listenExit` function lets you be notified when a critical error occurs and halts the background processes like Live.background, Backtest.background, or Walker.background.  It's specifically for those severe errors that stop everything.  These aren't the kinds of errors you can recover from; they're meant to signal a problem that requires immediate attention. The notifications are delivered one after another, even if your handling function takes some time to complete. This ensures that errors are processed in the order they happened, and prevents multiple callbacks from running simultaneously. You provide a function (`fn`) that will be called when such an error happens. This function receives the error object as an argument.  The `listenExit` function returns a function that you can call to unsubscribe from these critical error notifications.

## Function listenError

The `listenError` function lets you set up a way to catch and deal with errors that happen while your trading strategy is running, but aren't severe enough to stop everything completely. Think of it as a safety net for things like temporary API connection problems.

When an error occurs, the function you provide will be called to handle it. It's designed to process these errors one at a time, ensuring that your code doesn’t get overwhelmed, even if the error handling itself takes some time. This helps maintain the smooth operation of your backtesting process.


## Function listenDoneWalkerOnce

`listenDoneWalkerOnce` lets you react to when a background task within your backtest completes, but only once. You provide a filter function to specify which completion events you're interested in, and a callback function that will be executed when a matching event occurs.  Once the callback runs, the subscription is automatically removed, so you don't need to worry about cleanup. Think of it as a temporary listener that fires just once for a specific type of completion event.

## Function listenDoneWalker

This function lets you monitor when background tasks within a Walker complete. It provides a way to be notified when a Walker's `background()` method finishes its work.

Importantly, any actions you take in response to this notification will be processed one at a time, ensuring orderly execution even if your callback function involves asynchronous operations. Think of it as a reliable way to ensure things happen in the right sequence after a background process finishes.

You pass in a function (`fn`) that will be called with information about the completed event, and the function returns another function which you can use to unsubscribe from these completion notifications when you no longer need them.


## Function listenDoneLiveOnce

The `listenDoneLiveOnce` function lets you react to when a background task, started with `Live.background()`, finishes. You provide a filter function to specify which completed tasks you're interested in, and a callback function that will run once when a matching task finishes.  After the callback runs, the listener automatically stops listening, so you don't need to worry about cleaning it up. It's a simple way to get notified about the successful completion of a specific background process.


## Function listenDoneLive

This function lets you be notified when background tasks managed by Live are finished. Think of it as subscribing to a notification system for those tasks. The callback you provide will be executed after each background task completes, and it will happen in the order the tasks finished. Importantly, even if your callback function involves asynchronous operations, it will be handled one at a time to avoid any conflicts. You can unsubscribe from these notifications whenever you need to stop listening.

## Function listenDoneBacktestOnce

This function lets you react to when a background backtest finishes, but in a special way – it only triggers once and then stops listening. You provide a filter to specify which backtest completions you're interested in. When a matching backtest finishes, the provided callback function will be executed just once with information about that backtest. After that, it automatically stops listening for further backtest completion events.

## Function listenDoneBacktest

This function lets you react when a background backtest finishes running. 

It’s like setting up a listener that gets notified when a backtest is done. 

The events are handled one at a time, in the order they arrive, even if your reaction involves asynchronous operations. This ensures things don't get messy with multiple callbacks trying to run at once. You provide a function that will be called once a backtest concludes.

## Function listenCheckOnce

This function lets you listen for specific order check events – these are messages related to the status of orders. 

It's designed to execute a callback function only once when a matching event occurs. Think of it as a one-time alert for a particular type of order status update.

You provide a filter function to specify which events you're interested in, and a callback function to handle those events. If your callback function takes some time to complete (like returning a promise), the system will wait for it to finish before moving on. 


## Function listenCheck

The `listenCheck` function lets you monitor the status of your orders on an exchange. It listens for order-check ping events, processing them asynchronously.

Think of it as a way to confirm that an order you placed is still active and hasn't been accidentally closed or canceled.

It sends updates every time a new tick comes in while an order is being monitored, providing information about whether the order is currently active or if it’s a pending order (like a resting entry order).

If the check encounters a temporary error (like a network issue), it’ll try again a few times before giving up.  However, if the order is actually deleted from the exchange, it's considered a terminal error, and the connection will be closed. Rejected orders are treated as temporary issues.

You provide a callback function to handle these check events. If your function returns a promise, the processing will wait for it to finish.

## Function listenBreakevenAvailableOnce

This function lets you react to a specific breakeven protection event and then automatically stop listening. Think of it as setting up a one-time alert – once the condition you're looking for happens, the function will run your code and then quietly unsubscribe. It’s especially helpful when you only need to react to something once, like a specific breakeven state being reached.

You provide a filter to specify what kind of event you're looking for, and then you define a function to run when that event occurs. The function will execute just once, then the listener will stop listening. 


## Function listenBreakevenAvailable

This function lets you get notified when a trade's stop-loss automatically moves to breakeven – that’s when the profit covers all the costs associated with the trade. It's designed to handle these notifications even when your code takes some time to process each event. The notifications are delivered one at a time, ensuring that your callback function isn't overwhelmed, regardless of how long it takes to run.

You provide a function that will be called whenever a trade reaches the breakeven point, and this function will be executed in a controlled sequence.


## Function listenBeforeStartOnce

This function lets you react to specific events that happen right before a backtest begins. Think of it as setting up a one-time action that only runs when a particular condition is met. You provide a filter to define when you want this action to happen, and then you give it a function – your callback – that will execute exactly once when the filter matches. Once that callback runs, the listener automatically stops listening, keeping things clean and efficient.


## Function listenBeforeStart

This function lets you hook into what happens right before a trading strategy begins running for a specific asset. You can provide a function that will be called just before a new strategy starts, allowing you to perform actions like logging, data preparation, or other setup tasks. Importantly, this function ensures that these actions are handled one after another, even if your function involves asynchronous operations, preventing any potential conflicts or race conditions. To unsubscribe from these notifications, the function returns a cleanup function that you can call.

## Function listenBacktestProgress

This function lets you keep an eye on how a backtest is progressing. It essentially sets up a listener that gets notified as the backtest runs.

You provide a function that will be called whenever there's a progress update. The framework handles making sure these updates are processed one at a time, even if your update function takes some time to complete. This helps avoid any unexpected issues caused by running things simultaneously. The progress updates are delivered in the order they occurred during the backtest.


## Function listenAfterEndOnce

This function lets you react to specific events that happen after a trading simulation or backtest finishes. 

It allows you to set up a filter – a condition – so you only get notified about the events you care about. 

Once an event that matches your filter shows up, the provided callback function runs just once, and then the subscription is automatically turned off, keeping things clean and efficient. 

Essentially, it's a way to get a one-time notification about a particular event after a backtest concludes.


## Function listenAfterEnd

The `listenAfterEnd` function lets you hook into events that happen *after* a trading strategy's execution is finished for a specific asset. Think of it as getting a notification when a trading round is completely done.

It's designed to handle asynchronous code within your callback function gracefully; events are processed one after another to avoid any issues with overlapping operations. 

You provide a function as input—this function will be called whenever an "after end" event occurs, giving you the chance to react to the completion of a trading cycle.  The function you provide is automatically unsubscribed when you no longer need to listen for these events.


## Function listenActivePingOnce

This function lets you react to specific active ping events, but only once. 
It’s like setting up a temporary alert: you tell it what kind of event you're looking for, and when it sees that event, it runs your code and then stops listening. 
You provide a function that checks if an event matches what you need, and another function that gets executed when the matching event happens. 
After that one execution, the subscription is automatically cancelled, so you don’t have to worry about cleaning up.

Here's how it works:

*   `filterFn`: This tells the function what kinds of active ping events you're interested in.
*   `fn`: This is the code that gets run *once* when a matching active ping event occurs.

It returns a function that you can call to stop listening earlier if needed.

## Function listenActivePing

This function lets you keep an eye on active signals. It listens for events that happen every minute, giving you information about the state of those signals. Think of it as a way to monitor what's going on with your signals and react accordingly, maybe adjusting your strategies on the fly. 

It handles events one at a time, even if the function you provide takes some time to run, ensuring things are processed in the order they arrive. It also makes sure your code doesn’t try to do too much at once, preventing potential issues from running multiple things simultaneously.

You provide a function to be called each time a new ping event is detected; this function will receive details about the event. The function you provide will be returned by `listenActivePing`, which allows you to unsubscribe from these events later.

## Function listWalkerSchema

This function lets you see a complete list of all the "walkers" currently set up within the backtest-kit framework. Think of walkers as specialized tools that analyze and process your trading data. This is especially helpful if you're troubleshooting, want to understand how your system is configured, or if you’re building an interface to manage these walkers. It fetches all walkers registered using the `addWalker()` function.

## Function listStrategySchema

This function lets you see a complete rundown of all the trading strategies you've set up within the backtest-kit framework. It essentially gives you a list of all the registered strategies, showing you what's available for use. Think of it as a way to quickly check what strategies are ready to be backtested or used in a live trading scenario. It's particularly helpful if you’re trying to understand your system’s configuration or want to create a visual interface displaying the strategies.


## Function listSizingSchema

This function lets you see all the different sizing strategies that are currently set up in your backtesting environment. It essentially gives you a list of all the configurations used to determine how much of each asset to trade. Think of it as a way to peek under the hood and understand exactly how your trading decisions are being scaled. It’s particularly helpful if you’re troubleshooting, creating documentation, or building an interface to manage these sizing rules.

## Function listRiskSchema

This function helps you see all the risk configurations that are currently set up in your backtest. It's like a quick look under the hood to understand how risks are being managed. You can use this to check your work, build tools that show risk information, or just generally understand what's going on. It returns a list of all these risk configurations.

## Function listMemory

This function lets you see all the stored memory entries associated with your current signal. Think of it as a way to peek into the historical data your signal has been keeping track of. 

It handles the details of figuring out which signal it's connected to and whether you're running a backtest or a live trading session – you don't need to worry about those configurations. 

The function returns a list of objects, each showing a unique memory ID and the content it holds. The content will be of a specific type, determined when you set up the memory initially.


## Function listFrameSchema

The `listFrameSchema` function lets you see a complete inventory of all the different data structures (schemas) your backtest kit is using. It essentially gives you a list of all the "frames" – think of them as templates for organizing your trading data – that you've defined and made available. This is really handy if you’re trying to understand how your backtest is set up, generating documentation, or building tools that need to know about the different data formats in play. It returns this list asynchronously, so you’ll get a promise that resolves to an array of `IFrameschema` objects.


## Function listExchangeSchema

This function helps you discover all the exchanges that your backtest-kit system knows about. It's like taking a quick inventory of your trading connections. You can use this information to troubleshoot problems, generate documentation, or build user interfaces that adapt to the exchanges you’re using. It returns a list of schemas, each describing a different exchange.

## Function hasTradeContext

This function simply tells you whether the environment is ready for trading actions. It confirms that both the execution and method contexts are set up correctly. Think of it as a quick check to make sure you can safely use functions like getting candle data, price information, or formatting values – functions that rely on a complete trading environment being active. If it returns true, you're good to go; if not, something's missing and you need to set up the necessary context first.

## Function hasNoScheduledSignal

This function helps you check if a scheduled signal is currently active for a specific trading pair, like "BTC-USD". 

It returns `true` if no signal is scheduled, and `false` if one exists. 

Think of it as the opposite of a function that *does* check for scheduled signals; it’s handy for making sure your signal generation processes only run when needed. 

It figures out whether you’re in a backtesting environment or live trading mode all on its own. 

You just need to provide the symbol of the trading pair you’re interested in.


## Function hasNoPendingSignal

This function, `hasNoPendingSignal`, quickly checks if there's a pending trading signal currently active for a specific asset, like BTC-USDT. It's designed to be the opposite of `hasPendingSignal`, so you can use it to make sure a new signal isn't generated when one is already waiting. The function automatically adapts to whether you're running a backtest or a live trading session, simplifying your code. Just provide the symbol of the trading pair you want to check, and it will return `true` if no pending signal exists.

## Function getWalkerSchema

The `getWalkerSchema` function helps you find the blueprint for a specific trading strategy, or "walker," within your backtest setup. Think of it like looking up the detailed instructions for how a particular strategy operates. You provide the name of the strategy you're interested in, and it returns a structured description of that strategy's components and how they work together. This lets you understand and potentially modify the strategy’s design. It's essential for advanced users who need to examine or customize built-in strategies or use custom ones.


## Function getTotalPercentHeld

This function tells you what percentage of your original position you still hold. Think of it as how much of your initial investment is still actively trading. A value of 100 means you haven't closed any part of the position yet, while 0 means it's completely closed. 

It handles situations where you've closed off portions of your position over time, correctly calculating the percentage even if you've made multiple purchases (DCA) along the way.

You provide the trading pair symbol, like 'BTCUSDT', and it returns a number representing the percentage held. It works the same way as `getTotalPercentClosed`.

## Function getTotalPercentClosed

This function tells you how much of a trading position is still open. It returns a percentage, where 100 means you haven't closed any part of the position, and 0 means the entire position has been closed. If you’ve been adding to your position over time (dollar-cost averaging), this function accurately accounts for those partial closes when calculating the percentage. It works whether you're running a backtest or a live trade, automatically adjusting to the current environment. You just need to provide the symbol of the trading pair to get the information.

## Function getTotalCostClosed

This function calculates the total cost basis in dollars for a currently open position. 
It’s useful for determining your average entry price, especially when you’ve been adding to your position over time through dollar-cost averaging (DCA).
The function takes the trading pair symbol as input, like "BTCUSDT."
It handles situations where you’ve closed parts of your position previously, correctly factoring in those earlier entries.
It intelligently determines whether the function is being run in a backtest or a live trading environment, so you don't have to specify.

## Function getTimestamp

This function provides a way to get the current timestamp within your trading strategy. 

It's all about knowing *when* things are happening – whether you’re running a test of past data (backtest) or trading live.

During a backtest, it tells you the timestamp for the specific historical timeframe you're currently analyzing. When you’re actually trading live, it gives you the current, real-time timestamp.


## Function getSymbol

This function allows you to retrieve the symbol you're currently trading, like "BTCUSDT" or "ETHUSD." It's a simple way to know what asset your backtest or trading strategy is focused on. The function returns a promise that resolves to a string representing the symbol.

## Function getStrategyStatus

This function lets you peek at the current state of a trading strategy as it's running, providing insights into what's happening behind the scenes. It's like taking a snapshot of the strategy's memory, showing things like signals that are waiting to be processed, actions that are queued, and the overall status of the strategy. 

You can use it to check the status of a specific trading pair by providing the symbol. It works whether you're running a backtest or a live trading session, so you don't need to worry about setting that up separately.

## Function getStrategySchema

The `getStrategySchema` function helps you find the blueprint for a specific trading strategy. Think of it as looking up the detailed instructions for how a strategy operates. You provide the strategy’s name, and it returns a structured description of that strategy, outlining things like its inputs and outputs. This allows you to understand and work with registered strategies programmatically. It's useful when you need to dynamically work with strategy definitions within your backtesting system.

## Function getStrategyPaused

This function lets you check if a trading strategy is currently paused. When a strategy is paused, it won't initiate any new trades – the `getSignal` function won't be called, and any new trade requests are temporarily held back. However, any existing open trades or scheduled actions will still be managed and closed as usual. The framework automatically figures out whether it's running in a backtesting environment or a live trading situation, so you don't need to worry about that. You provide the trading pair symbol (like "BTC-USDT") to find out the paused state for that specific strategy.

## Function getSizingSchema

The `getSizingSchema` function helps you find the specific rules and logic used to determine how much of an asset to trade. It's like looking up a recipe for your trade size. You give it a name – a unique identifier for the sizing method you want – and it returns the detailed configuration associated with that name. This lets you access and understand the sizing strategy being applied in your backtest.

## Function getSignalState

This function helps you retrieve a specific value associated with a trading signal. It works by automatically identifying the active signal, whether it's a pending or scheduled one, based on the current environment.

Essentially, it's designed to pull data related to a trade, like performance metrics, as the trade progresses.

The function adjusts its behavior depending on whether you're in backtesting or live trading mode.

This is particularly useful for advanced strategies that track metrics like how long a trade is open and its percentage gain, as it facilitates gathering data across multiple trades within a single signal. It's built with strategies in mind that aim for modest profits with controlled risk.


## Function getSessionData

This function lets you retrieve data that’s specific to a particular trading pair and strategy during a backtest or live trading session. Think of it as a way to store and recall information that needs to be remembered across multiple price candles – like results from complex calculations or intermediate states of an indicator. The framework handles whether it's a backtest or live run automatically, so you don’t have to worry about that. You pass in the trading symbol (like "BTC-USD") to get the associated data. If no data exists for that symbol, it will return null.

## Function getScheduledSignal

This function lets you retrieve the currently scheduled trading signal for a specific asset, like BTC-USD. 

It's designed to give you the signal that's currently in effect, based on your scheduled strategies. 

If there isn't a scheduled signal active for that asset right now, it will simply return nothing. 

The function cleverly figures out if it's being used during a backtest or a live trading session without you needing to specify.

You just need to provide the symbol of the trading pair you're interested in.


## Function getRuntimeInfo

This function lets you peek under the hood and learn about the context of your backtest or live trading session. It provides information like which symbol you're trading, the exchange you're connected to, the timeframe being used, and the specific strategy currently running. Essentially, it gives you a snapshot of the environment your trading logic is operating within – whether it's a historical simulation or a live execution. You can use this to dynamically adjust your behavior or for logging and debugging purposes.

## Function getRiskSchema

This function helps you find details about a specific type of risk being managed in your backtest. It’s like looking up a blueprint – you give it the name of the risk (like "VolatilityRisk" or "PositionSizeRisk") and it returns a description of how that risk is defined and calculated. Think of it as a way to understand exactly what factors are being considered when assessing risk. The name you provide must match a risk that has already been defined within the backtest kit.

## Function getRemainingCostBasis

This function helps you figure out how much of a particular asset you still have left, considering you might have sold off portions of your initial purchase. 

It calculates the remaining cost basis, which represents the value of the position that hasn't been closed through partial sales. 

This is useful for tracking your investment and understanding your overall exposure.

Importantly, it takes into account dollar-cost averaging (DCA) strategies, so it accurately reflects how your position has been managed over time.

Essentially, it’s a way to determine the remaining value linked to your original cost basis. It's also a handy shortcut to the total cost closed.

You just need to provide the trading symbol (like "BTC-USDT") to get the result.

## Function getRawCandles

The `getRawCandles` function is your go-to for retrieving historical candlestick data. 

It lets you specify exactly which candles you need, giving you options for setting start and end dates, as well as the number of candles to pull. 

You can use date ranges to narrow down your search, or just specify a limit to get a certain number of candles from the execution context's starting point.

It’s built to be fair; the function ensures it doesn’t peek into the future when fetching data, preventing biased results.

Here's a breakdown of the parameters:

*   `symbol`: The trading pair you're interested in, like "BTCUSDT".
*   `interval`: The time frame for each candle (e.g., 1 minute, 5 minutes, 1 hour).
*   `limit`:  How many candles you want to retrieve.
*   `sDate`: The starting date for your data, in milliseconds.
*   `eDate`: The ending date for your data, also in milliseconds.

## Function getPositionWaitingMinutes

This function helps you find out how long a trading signal has been waiting to be put into action. It checks a specific trading pair, like BTC-USDT.

If a signal is waiting, it will return the time in minutes.

If there’s no signal currently waiting for activation for that trading pair, the function will tell you by returning null. You provide the symbol of the trading pair as input, like a string.

## Function getPositionPnlPercent

This function lets you quickly check the unrealized profit or loss as a percentage for an open trade. It takes the symbol of the trading pair (like 'BTC-USDT') as input.

It considers factors like any partial closing of the position, cost averaging, potential slippage, and fees, to give you a realistic picture of your performance.

If there's no open trade currently being tracked, it will return null. 

The function handles the technical details automatically – it figures out if you're in backtesting mode or live trading, and fetches the current market price as well.


## Function getPositionPnlCost

This function helps you figure out the unrealized profit or loss in dollars for a trade you're currently holding. It considers factors like the percentage change in price, how much you initially invested, and even things like slippage and fees.

It gives you a number representing that unrealized P&L, or returns null if there's nothing currently being held.

The function automatically knows whether it's running in a backtesting simulation or a live trading environment, and it also gets the current market price for you. To use it, just provide the symbol of the trading pair you’re interested in.

## Function getPositionPartials

This function helps you peek at the partial profit or loss orders that have been placed for a specific trading pair. It gives you a history of how much of your position has been closed out in smaller chunks. 

You'll get a list of events, each detailing whether it was a profit or loss take, the percentage of the position closed, the price at which it happened, and the cost basis and entry count at that time.

If no signal is currently active, it will return null. If you have active signals but haven't taken any partial profits or losses, it will return an empty list. You simply provide the symbol of the trading pair you're interested in.

## Function getPositionPartialOverlap

This function helps prevent accidentally closing a position partially multiple times at roughly the same price. It checks if the current market price is close enough to a previously executed partial close order.

Essentially, it looks to see if the current price falls within a defined range around the price of any existing partial close orders.

If a partial close order's price is within that range, the function returns `true`, signaling that you might want to reconsider placing another partial close at that price level. If no partials exist or the current price is far from any existing ones, it returns `false`.

You can fine-tune how close is considered "too close" by providing a `ladder` configuration, which allows you to set the acceptable percentage tolerance for the upper and lower bounds. If you don’t provide a `ladder`, it uses a default tolerance of 1.5% above and below the existing partial close price.

## Function getPositionMaxDrawdownTimestamp

This function helps you pinpoint exactly when a trading position experienced its biggest loss. It returns a timestamp, a specific moment in time, marking the lowest point of the position's performance. 

If there isn't an active trading signal associated with the position, the function will return null, indicating that the information isn't available.

You’ll need to provide the trading pair symbol, like 'BTC-USD', to specify which position’s drawdown information you’re requesting.

## Function getPositionMaxDrawdownPrice

This function helps you understand the maximum drawdown experienced by a specific trading position. It essentially tells you the lowest price the position hit while it was open, reflecting the biggest loss it faced.

Think of it as a way to see how much "pain" a trade went through.

To use it, you simply provide the symbol of the trading pair you're interested in.

If there’s no open position for that symbol, the function won't return any value.


## Function getPositionMaxDrawdownPnlPercentage

This function helps you understand the performance of a specific trading position. It calculates the maximum drawdown in percentage terms, based on the profit and loss (PnL) experienced by that position since it was opened. Essentially, it tells you how far the position's profit dipped at its lowest point.

You provide the trading pair symbol (like BTC-USDT) as input.

If there are no active signals for that position, the function will return null.


## Function getPositionMaxDrawdownPnlCost

This function helps you understand how much money you lost at the very bottom of your trading performance for a specific asset, like a stock or cryptocurrency. It calculates the PnL cost, essentially the monetary loss, experienced when the position hit its lowest point.

If there aren't any active trading signals for that asset, the function will return null, indicating no data is available. You just need to provide the symbol of the asset you're interested in, such as "BTC-USDT".

## Function getPositionMaxDrawdownMinutes

This function tells you how much time has passed since the lowest point in a trade's performance. It essentially measures the duration of the maximum drawdown.

Think of it as a way to understand how long ago things got really bad for a specific trade.

The value will be zero if the worst loss just happened. If there's no open trade for the given symbol, the function will return null.

You provide the symbol of the trading pair (like BTC/USDT) to get the drawdown time for that specific trade.

## Function getPositionLevels

This function helps you retrieve the prices at which you've entered a trade using dollar-cost averaging (DCA). It gives you a list of prices, starting with the initial price you bought at, and including any prices added later when you used the `commitAverageBuy` function. 

If you haven't placed a pending order yet, it will return nothing. If you did place an order but didn't add any more prices through DCA, it will give you an array containing only the original entry price. You need to pass the trading pair symbol, like "BTCUSDT", to know which position's prices you're looking at.

## Function getPositionInvestedCount

This function helps you track how many times you've added to a position using dollar-cost averaging (DCA) for a specific trading pair. 

It essentially counts the number of times a buy order has been committed when a signal is active. A value of 1 means it’s the initial buy, and each subsequent increase represents a DCA top-up. 

If there’s no ongoing signal for the trading pair, the function will return null. This function automatically adjusts itself based on whether the backtest is running in backtest or live mode.

You provide the trading pair symbol (like BTC-USDT) as input.

## Function getPositionInvestedCost

This function helps you figure out how much money you've invested in a particular trading pair, like BTC-USD. 

It calculates the total cost based on all the times you've bought into that position, using the cost you set when you initially committed to that average buy.

If there's no open position currently being considered, it will return null.

It’s designed to work seamlessly whether you're doing a backtest or live trading. You just need to provide the symbol of the trading pair you're interested in.


## Function getPositionHighestProfitTimestamp

This function helps you find out exactly when a specific trading position achieved its highest profit. It looks at a position for a particular trading pair (like BTC/USD) and tells you the timestamp – that's the date and time – when the profit was at its peak. 

If there's no record of any signals for that trading pair, the function won't have any data to report and will return null. You’ll need to provide the symbol of the trading pair you're interested in.


## Function getPositionHighestProfitPrice

This function helps you find the highest price a position has reached while being profitable. It's like tracking the peak of a climb! 

It starts by remembering the price when the position was opened. Then, it constantly updates this value as the price moves in a favorable direction – higher for long positions and lower for short positions. 

You'll always get a price back, even when a position first opens because it defaults to the entry price. This makes it useful for monitoring performance and identifying potential profit targets. The function requires the trading symbol to know which position to analyze.

## Function getPositionHighestProfitMinutes

This function helps you understand how long a trade has been operating since it reached its most profitable point. It essentially tells you how far away the current price is from the highest profit the trade has ever seen. Think of it as a measure of how much the trade has given back from its peak.

It's closely related to drawdown – it shows the duration of the pullback from that peak.

The value will be zero if the function is called at the exact moment the trade reached its highest profit.

If there’s no active trading signal for the given symbol, the function returns null.

You need to provide the symbol of the trading pair you're interested in, like "BTCUSDT".

## Function getPositionHighestProfitDistancePnlPercentage

This function helps you understand how far your trading position has moved from its best-ever profit point. It calculates the difference between the highest profit percentage you've ever achieved on a trade and your current profit percentage.

The result is always a positive number or zero—it focuses on the distance, so any negative differences are treated as zero.

If there’s no trading data available for the specified symbol, the function won’t return a value.

You provide the trading pair symbol (like "BTC-USDT") to identify the position you want to analyze.

## Function getPositionHighestProfitDistancePnlCost

This function helps you understand how far your trading position is from its best-possible profit. It calculates the difference between the highest profit you could have made and what you’re currently making. Think of it as measuring how much room there is for improvement in your position’s performance. It relies on having pending signals available. If there are no signals, the function won’t be able to compute this distance and will return null. You pass it the trading symbol (like "BTC-USDT") to focus on a specific pair.

## Function getPositionHighestProfitBreakeven

This function helps you understand if a trade could have reached a breakeven point during its most profitable moment. It checks if, based on the data, reaching breakeven was a possibility when the trade was performing at its peak. If no trade signals are currently active, the function will indicate that. You provide the trading pair symbol (like BTC/USDT) as input to see if breakeven was achievable for that particular trade.

## Function getPositionHighestPnlPercentage

This function lets you check how well a particular trade has performed. Specifically, it tells you the highest percentage profit the position ever reached while it was open. 

It looks at a single trading pair, like 'BTC-USDT', and returns a number representing that peak profit percentage. 

If there's no trading signal currently associated with that position, the function will return null, indicating no data is available.

## Function getPositionHighestPnlCost

This function helps you find the highest cost associated with profit for a specific trading pair. It looks back at the entire history of a position and determines the cost when the most profitable price was achieved. 

Essentially, it's telling you how much it cost to reach the peak profit for that trade. If there's no trading signal for that pair, the function will return null.

You just need to provide the trading pair symbol, like "BTC-USDT".

## Function getPositionHighestMaxDrawdownPnlPercentage

This function helps you understand the risk exposure of a trading position by revealing the largest percentage drop from its peak profit. It calculates the difference between the current profit percentage and the lowest profit percentage reached during the position's life.

Think of it as showing you how far a position has fallen from its highest point, expressed as a percentage.

If there's no trading signal currently active for the specified trading pair, the function won’t be able to provide a result.

You’ll need to provide the symbol of the trading pair (like "BTC-USDT") to the function to get this drawdown information.


## Function getPositionHighestMaxDrawdownPnlCost

This function helps you understand how much your trading position has lost relative to its lowest point. It figures out the difference between your current profit and loss and the largest drop in profit you've experienced. Think of it as a measure of how far you've fallen and how much potential recovery you have. If no trading signals are active for a particular trading pair, it won't be able to provide a value. 

You give it the symbol of the trading pair (like "BTC-USDT") to get this drawdown information. The result is a number representing the potential PnL cost difference.


## Function getPositionEstimateMinutes

getPositionEstimateMinutes tells you how long a trade is expected to last.

It looks at the current signal and finds the estimated duration in minutes.

If there's no active signal, it will return null.

You provide the trading pair symbol to identify which trade the estimate applies to.

## Function getPositionEntryOverlap

getPositionEntryOverlap lets you verify if the current market price aligns with any of your existing DCA entry levels. It's a safeguard to stop you from accidentally creating duplicate DCA entries at roughly the same price point.

Essentially, it checks if the current price falls within a defined range around each of your pre-set DCA levels, considering a small tolerance for fluctuation.

The function will return true if a match is found, indicating a potential overlap.  If no existing signal is present, it returns false.

You can configure this tolerance range using the `ladder` parameter, specifying percentage-based boundaries for upper and lower limits.

## Function getPositionEntries

getPositionEntries lets you see the details of how a trading position was built, step by step. It shows the price and cost associated with each buy order that makes up the current signal.

If there’s no active signal, it won't return anything. If only a single buy order was placed, you'll get an array containing just that one entry.

Each entry in the list gives you the price at which the trade was executed and how much money was spent on it.  You can use this to understand exactly how your DCA strategy unfolded for a specific trading pair.  You just need to provide the symbol of the trading pair you're interested in.

## Function getPositionEffectivePrice

This function helps you figure out the average entry price for your current trading position, taking into account any dollar-cost averaging (DCA) adjustments. It calculates a weighted average based on how much you spent and the price at which you bought.

If you’ve made partial sales, it considers the prices at which those sales occurred. If you haven't used DCA, it defaults to the original opening price.

It returns `null` if there’s no current trading position. The function works seamlessly whether you're running a backtest or a live trade.

You only need to provide the trading pair symbol (like BTC-USDT) as input.


## Function getPositionDrawdownMinutes

getPositionDrawdownMinutes tells you how much time has passed since your position reached its highest profit. Think of it as a measure of how far your profits have fallen from their peak. It starts at zero when your position first becomes profitable, and then increases as the price moves against you. If no trade is active, it won't return a value. You provide the trading pair symbol, like "BTCUSDT," to specify which position's drawdown you want to know.

## Function getPositionCountdownMinutes

This function helps you determine how much time is left before a trading position expires. It calculates the time remaining based on when the position was initially pending and an estimated expiration time. 

Essentially, it tells you how long you have until the position needs to be dealt with.

If there's no pending position information, the function will return null. It ensures the countdown never goes into negative numbers, always displaying a minimum of zero. You provide the trading pair symbol (like BTC-USDT) as input.


## Function getPositionActiveMinutes

The `getPositionActiveMinutes` function helps you understand how long a particular trading position has been open. It calculates the total minutes since the position was initially created.

If there isn’t a pending signal for that symbol, the function will return null, indicating no active position to measure.

To use it, you simply provide the trading pair symbol (like 'BTCUSDT') as input.


## Function getPendingSignal

This function lets you check if your trading strategy has a pending order waiting to be triggered. It gives you the details of that pending order, if one exists. If there isn't a pending order currently set, it simply tells you by returning nothing. It's designed to work seamlessly whether you're testing your strategy in a backtest or running it live. You just need to provide the trading pair symbol, like "BTCUSDT", and it will do the rest.

## Function getOrderBook

This function lets you retrieve the order book data for a specific trading pair, like BTCUSDT. It pulls this information from the exchange you're connected to. 

The function takes the trading pair symbol as input. You can also specify the desired depth of the order book, controlling how many levels of bids and asks are returned, though there’s a default value if you don’t specify it. The system automatically handles the timing of the request based on the current environment, whether it's a backtest or live trading scenario.


## Function getNextCandles

This function helps you grab a batch of historical candles for a specific trading pair and time interval. Think of it as pulling data from the exchange to see how a symbol has performed recently. You provide the symbol like "BTCUSDT", the candle timeframe (like 1 minute, 5 minutes, or 1 hour), and how many candles you want to retrieve. The function then gets the candles that come *after* the current time being used by the backtesting system.


## Function getMode

This function simply tells you whether the backtest kit is currently running a simulation (backtest mode) or is connected to a live trading environment. It returns a promise that resolves to either "backtest" or "live", letting you know the context of your trading logic. This is useful for conditionally executing different code paths based on whether you're testing or actively trading.

## Function getMinutesSinceLatestSignalCreated

This function helps you determine how much time has passed since the most recent trading signal was generated for a specific trading pair. It calculates the time in whole minutes.

It doesn't differentiate between signals that are currently active or have already ended; it simply looks at the timestamp of the last signal recorded.

This is handy if you need to implement a waiting period, like a cooldown, after a stop-loss is triggered.

The function searches for the signal information first in the historical data storage and then in the current, live data.

If no trading signals are found for the specified symbol, it will return null. The function automatically figures out whether it’s running in backtest or live mode based on where it’s being used.

You provide the trading pair's symbol to tell it which signal you're interested in.

## Function getMaxDrawdownDistancePnlPercentage

This function helps you understand the risk profile of a trading strategy by calculating the maximum drawdown. Specifically, it measures the difference between the highest profit achieved and the lowest point reached, expressed as a percentage. This value shows you the largest potential loss from a peak to a trough in the strategy's performance.

To use it, you provide the trading symbol (like 'BTC-USD').

The result will be a number representing the drawdown percentage, or null if there’s no trading signal currently active.

## Function getMaxDrawdownDistancePnlCost

This function helps you understand the risk profile of a trading strategy by calculating the maximum drawdown distance based on profit and loss. It essentially measures the difference between the highest profit you ever made and the lowest point your position reached. This value represents the potential loss you could have experienced if you had sold at the bottom.

The function takes the trading symbol (like "BTC-USDT") as input and returns a number, which is the calculated drawdown distance. If no trading signals were generated for that symbol, the function will not return a value.


## Function getLatestSignal

This function helps you retrieve the most recent trading signal for a specific asset, whether it's still active or has already been closed. It’s handy for things like pausing your strategy after a stop-loss event – you can use the signal’s timestamp to enforce a cooldown period. The function looks for this signal first in historical data and then in current, real-time data, returning nothing if no signal exists. It automatically adjusts its behavior based on whether you're running a test or live trading. You provide the symbol of the trading pair you're interested in.

## Function getFrameSchema

The `getFrameSchema` function lets you look up the blueprint for a specific frame within your backtest setup. Think of it as finding the detailed instructions for how a particular frame—like a data frame or an order frame—is structured and what data it contains. You provide the frame's unique name, and the function returns a schema object describing that frame. This is useful for understanding the expected data format or validating that a frame is set up correctly.


## Function getExchangeSchema

This function helps you find the detailed information about a specific cryptocurrency exchange that backtest-kit understands. You give it the name of the exchange, like "Binance" or "Coinbase", and it returns a structured description of how that exchange works – things like what endpoints it uses, what data it provides, and how to interpret that data. It’s like looking up the blueprint for how backtest-kit interacts with each exchange. This is useful when you want to customize your backtesting strategies and ensure they work correctly with particular exchanges.


## Function getDefaultConfig

This function provides a set of default settings for the backtest-kit framework. Think of it as a starting point – a template you can use to customize how your trading simulations run. It includes settings for things like how often the system checks for new trading opportunities, how it handles order execution (fees, slippage), limits on the amount of data processed, and various display and notification controls. Examining the default configuration is a great way to understand all the options you have to fine-tune the behavior of your trading backtests.

## Function getDefaultColumns

This function provides a set of pre-defined column configurations used when generating reports. It essentially gives you a blueprint for how your data columns will be structured and displayed. 

Think of it as a way to explore the available column types – like those for closed trades, heatmap data, live ticks, or performance metrics – and see what their default settings are. You can use this to understand the possibilities for customizing your reports. It returns a snapshot of these default configurations, which is read-only, so you can't modify it directly but can use it as a reference.

## Function getDate

This function, `getDate`, simply retrieves the current date. 

It behaves differently depending on whether you're in a backtesting scenario or a live trading environment.

During backtesting, it provides the date associated with the timeframe you're analyzing. When running live, it gives you the actual, real-time date. Essentially, it's a way to know what date you're working with in your code.

## Function getContext

This function gives you a snapshot of what's happening right now within your backtesting process. Think of it as a way to peek under the hood and see details like the current time period, the specific strategy being executed, and other relevant environmental information. It returns a promise that resolves to a structured object containing this contextual data. This helps you understand the environment within which a particular part of your trading logic is running.

## Function getConfig

This function lets you peek at the current settings used by the backtesting framework. It gives you a snapshot of values that control various aspects of the backtest, such as retry attempts for fetching data, limits on the number of signals or notifications, and flags enabling certain features like dollar-cost averaging.  The returned values are a copy, so changing them won’t affect the actual running configuration. It's helpful for understanding how the framework is set up or for debugging purposes. You'll find settings related to data fetching, order processing, reporting, and more, providing a comprehensive view of the backtest's operational parameters.

## Function getColumns

This function lets you peek at the columns being used to build your backtest reports. 

It provides a snapshot of the column configurations for various data types like closed trades, heatmaps, live data, and performance metrics.

Think of it as a way to understand what data is being displayed in your reports without changing the underlying setup. It ensures that you're working with a copy, so your report definitions remain safe.

## Function getClosePrice

To retrieve the most recent closing price for a trading pair, use this function. You'll need to specify both the symbol, like "BTCUSDT", and the time interval you're interested in, choosing from options like "1m" for one-minute candles up to "8h" for eight-hour candles. The function will then return a promise that resolves to the closing price of the latest available candle for that symbol and interval. This is useful for quickly checking the current market price at a specific timeframe.


## Function getCandles

To retrieve historical price data, the `getCandles` function lets you request a specific number of candles for a given trading pair and time interval.  It pulls this data directly from the exchange you're using. 

You'll specify the symbol, like "BTCUSDT" to get Bitcoin against USDT, the timeframe you're interested in (options include 1 minute, 3 minutes, 1 hour, and several others), and how many candles you want to see. The function returns a promise that resolves to an array of candle data points, each representing a period of time. This function essentially acts as a bridge to get the price history needed for analyzing or backtesting trading strategies.


## Function getBreakeven

This function helps determine if a trade has become profitable enough to cover the costs associated with it. It looks at the current price of an asset and compares it to a calculated threshold that factors in slippage and fees. Essentially, it tells you if the price has moved sufficiently in a positive direction to ensure you’d be in the green if you closed the position. It works whether you're in a backtesting environment or live trading. You'll need to provide the trading pair symbol and the current price for the function to work.

## Function getBacktestTimeframe

This function helps you find out the dates available for backtesting a specific trading pair, like BTCUSDT. It returns a list of dates that represent the timeframe for which historical data is accessible for backtesting. Essentially, it tells you what dates you can use when you’re simulating trades to see how a strategy would have performed. You provide the symbol of the trading pair you’re interested in, and it gives you back a list of dates.

## Function getAveragePrice

This function helps you find the Volume Weighted Average Price, or VWAP, for a given trading symbol like BTCUSDT. It looks at the most recent five one-minute candles to do this calculation. The VWAP is determined by figuring out a "typical price" for each candle, then weighting that price by the volume traded. If there's no trading volume for a particular candle, it simply uses the closing price instead. You just need to provide the symbol of the trading pair to get the VWAP.

## Function getAggregatedTrades

This function retrieves a list of combined trades for a specific trading pair, like BTCUSDT. It pulls this data from the exchange you've configured within the backtest-kit.

The trades are gathered going backward in time from the current point in your backtest.

You can request a limited number of trades with the `limit` parameter. If you don't provide a limit, it fetches trades from within a defined time window. The function makes sure to retrieve at least the specified number of trades, even if it needs to page back through older data.


## Function getActionSchema

This function helps you find the blueprint for a specific action within your trading strategy. Think of it as looking up the definition of what a particular action, like "placeOrder" or "cancelOrder," is supposed to do.  You provide the name of the action you're interested in, and it returns a detailed description of that action, outlining its expected inputs and outputs. This is essential for validating your actions and ensuring everything is set up correctly.


## Function formatQuantity

This function helps you display the correct quantity of an asset when trading. It takes the trading pair symbol, like "BTCUSDT," and the raw quantity value as input. Then, it automatically adjusts the number of decimal places based on the specific exchange's rules, ensuring accuracy and compliance. Essentially, it handles the formatting details so you don't have to. 


## Function formatPrice

The `formatPrice` function helps you display prices in the correct way for a specific trading pair. It takes the symbol of the trading pair, like "BTCUSDT," and the raw price value as input. The function then applies the formatting rules that are specific to that exchange, ensuring the price is displayed with the correct number of decimal places. This is important because different exchanges have different standards for how they present price information.

## Function dumpText

The `dumpText` function lets you record raw text data, associating it with a specific signal and a unique identifier. Think of it as a way to permanently store notes or observations relevant to a particular trading decision. It handles the signal automatically, meaning you don't need to specify it directly – the system figures it out. The function also adapts to whether you’re running a backtest or a live trading session. 

You provide a data object containing the bucket name, a unique dump ID, the actual text content you want to record, and a short description for context. This function promises to complete its task and doesn’t return any value.


## Function dumpTable

This function helps you display data in a structured table format, perfect for examining results during backtesting or live trading. It takes an array of objects and presents them as a table, automatically adapting to the current environment (whether you're backtesting or trading live). The table’s column headers are intelligently determined from the data itself – it figures out all the possible column names based on the keys present in your objects.  You don’t have to manually define them. It also handles the complexities of signals, resolving any pending or scheduled signals automatically.


## Function dumpRecord

The `dumpRecord` function lets you save a snapshot of data related to a trading activity. Think of it as creating a record of what happened during a specific time, associated with a particular 'bucket' and a unique identifier. It takes information like the bucket name, a dump ID, the data itself (as a flexible record), and a descriptive note, then stores this information. The function intelligently figures out whether you're running a test or a live trading session and handles the necessary signals for you, making the process straightforward. Essentially, it simplifies the process of logging important details for analysis and auditing.


## Function dumpJson

The `dumpJson` function lets you save complex data structures as formatted JSON, associating them with a specific bucket and ID. Think of it as a way to log detailed information about your trading decisions or system state.  This function cleverly handles the execution environment, figuring out whether it's running a backtest or a live trading scenario. It also automatically deals with pending or scheduled signals, streamlining your workflow. You provide the data you want to save as a JavaScript object, along with a description for context.

## Function dumpError

This function lets you record detailed error descriptions related to a specific trading signal. It’s helpful for tracking down problems during backtesting or live trading. When you call it, the framework automatically figures out which signal the error applies to, and whether you're running a backtest or a live trade. It will then save that error description with a unique identifier, so you can find it later.

The `dto` parameter contains all the information needed for this error record, including the signal's name, a unique dump ID, the error message itself, and a short description of what went wrong. Think of it as a way to leave a breadcrumb trail for debugging.


## Function dumpAgentAnswer

This function lets you save the complete conversation history with the agent, including all the messages exchanged. It's really useful for debugging or reviewing how the agent interacted during a particular trading scenario. The function intelligently figures out which signal the conversation belongs to and whether you're in a backtest or live trading environment, so you don't have to specify those details manually. You provide a data object containing the bucket name, a unique ID for the dump, the list of messages, and a brief description.


## Function createSignalState

The `createSignalState` function helps you manage the state of a trading signal, providing functions to get and update it. Think of it as a way to keep track of information related to a specific trading signal, like its current value or any related metrics.

It’s designed to automatically figure out whether you're in backtesting mode or live trading, so you don't need to manually specify that information each time.

This is particularly useful for strategies that collect data over time, like those using Large Language Models, to analyze how trades perform and make adjustments.  The function is built to easily track things like peak profit and how long a trade remains open.


## Function commitTrailingTakeCost

This function lets you set a specific, fixed price for your take-profit order. It simplifies adjusting your take-profit by automatically calculating the correct percentage shift based on your initial take-profit distance. The framework handles the details of determining whether you're in a backtest or live trading environment and retrieves the current market price for accurate calculations. You just provide the symbol you’re trading and the desired absolute take-profit price.


## Function commitTrailingTake

This function helps you fine-tune your take-profit orders as the market moves. It's designed to adjust the distance of your trailing take-profit, ensuring it stays relevant and helps protect profits.

The key thing to remember is that it always bases its calculations on the *original* take-profit level you set initially. This is important because it stops errors from building up if you call it multiple times.

If you want to make your take-profit more conservative (closer to the entry price), use a negative percentage shift.  To be more aggressive (further from the entry), use a positive percentage. The system prioritizes being conservative—it won't move your take-profit further away if you ask it to.

For long positions, the take-profit will only move closer to the entry. For short positions, it will only move further away.  The function also automatically knows whether it's running in a backtest or live trading environment.

You’ll need to provide the trading symbol, the percentage adjustment you want to apply, and the current market price.

## Function commitTrailingStopCost

This function helps you update the trailing stop-loss order for a specific trading pair to a fixed price. Think of it as setting a hard limit on how low the price can go before the order triggers. It simplifies the process by automatically calculating the necessary percentage shift from the original stop-loss distance. The framework takes care of figuring out if you’re running a backtest or a live trade and gets the current market price to ensure the adjustment is accurate.

You provide the symbol of the trading pair and the desired new stop-loss price, and it handles the rest. 

The function returns a promise that resolves to a boolean indicating success or failure.

## Function commitTrailingStop

The `commitTrailingStop` function helps you manage trailing stop-loss orders. It's designed to adjust the distance of your stop-loss based on a percentage shift relative to the original stop-loss level you set initially. 

It's important to note that this function always calculates changes from the original stop-loss, not from any previously adjusted trailing stop. This prevents small errors from building up over multiple adjustments.

When you use this function, if you're increasing the distance of your stop-loss, it only happens if the new distance provides better protection for your profit.  For long positions, the stop-loss will only move further away from the entry price; for short positions, it will only move closer to the entry price. 

Finally, the function automatically knows whether it's running in a backtest or live trading environment.

You provide the symbol of the trading pair, the percentage you want to shift the stop-loss by, and the current market price.

## Function commitSignalNotify

This function lets you send out custom informational messages during your backtests or live trading. Think of it as a way to add extra details to your strategy's log – maybe you want to note when a specific indicator triggers, or alert yourself to unusual market activity. It doesn't change your positions, it just provides extra context.

The function automatically figures out whether you're in backtest or live mode and also pulls in details like your strategy name and the exchange you’re using. It even gets the current price for you.

You need to provide the trading symbol (like "BTCUSDT") as a required input. You can also add extra information to your message using the optional `payload` parameter, tailoring the message to what's most useful for you.

## Function commitPartialProfitCost

This function helps you partially close your trading position when you've reached a certain profit level, measured in dollars. It's a simplified way to manage profit-taking, calculating the necessary percentage of the position to close based on the dollar amount you specify. 

Essentially, it automatically handles the details of converting your dollar target into a percentage for the trade.

The function requires the trading symbol and the dollar amount you want to profit from. 

It also ensures the price is moving in a favorable direction toward your target profit before executing the partial close. The system knows if it's running in a backtest or live environment and will automatically determine the current price for the trade.


## Function commitPartialProfit

This function lets you automatically close a portion of your open trading position when the price moves in a profitable direction, essentially helping you lock in some gains. 

It's designed to close a specific percentage of the position, like 25% or 50%, as the price heads towards your take profit target. 

You just need to tell it which trading pair you’re dealing with and what percentage of the position you want to close, and it handles the rest, working whether you're in a backtesting or live trading environment. The system makes sure the price is actually moving in a direction that's good for you before closing any part of the trade.


## Function commitPartialLossCost

This function helps you automatically close a portion of your trading position when it's experiencing losses, by a specific dollar amount. It simplifies the process of partially closing to manage risk, essentially moving towards your stop-loss level. The function figures out the right percentage to close based on your initial investment, so you don't have to do the calculation yourself.

It works whether you're backtesting or trading live, and it automatically gets the current price to determine how much to close.

To use it, you provide the trading pair symbol and the dollar amount you want to recover.


## Function commitPartialLoss

The `commitPartialLoss` function lets you partially close an open position when the price is heading towards your stop-loss level. It's designed to help manage risk by closing a portion of the trade when it's moving against you. You specify the trading symbol and the percentage of the position you want to close, up to 100%. The framework automatically figures out whether it's running in a backtesting or live environment. It's important to note that this function is only triggered when the price movement aligns with the direction of your stop-loss.


## Function commitCreateTakeProfit

This function lets you tell the system that a take-profit order for a position has been filled on the exchange, even if it happened outside of the VWAP calculations. It's used when the exchange executes the order at a price different from what the strategy initially targeted.

Essentially, it bridges the gap between the strategy's calculations and the actual market execution. The framework will acknowledge this by marking the position as closed with a "take_profit" reason on the next tick.

If there's no open position waiting for a take-profit, this function does nothing. The system automatically knows whether it’s running a backtest or live trading.

You can also optionally include extra details like an order ID or a note with the function call.

## Function commitCreateStopLoss

This function lets the backtest framework know that a stop-loss order has been executed on the exchange. Sometimes, orders are filled at unexpected prices due to market volatility, bypassing the framework's internal VWAP-based stop-loss checks.

Essentially, it synchronizes the framework's understanding of the trading process with what's actually happening on the exchange.

The function doesn’t create the stop-loss order itself—it just confirms that it has been filled. If there’s no pending order, nothing happens.

It automatically adapts to whether you're in a backtest or live trading environment.

You can optionally include details like an order ID or a note with the confirmation.

## Function commitCreateSignal

This function lets you inject custom trading signals into the backtest or live environment, bypassing the usual signal fetching process. You provide a signal as a DTO, and it's added to the queue to be processed during the next market tick. 

If you don't provide a target price (`priceOpen`) in the signal, it will execute immediately at the current price. If you *do* provide a target price, the signal will either execute immediately if that price is already reached, or it will be scheduled to execute when the target price is met.

The system checks the signal to make sure it's valid, and prevents you from sending too many signals at once. The function automatically determines whether it's running in a backtest or live environment.

It requires both a symbol (like 'BTCUSDT') and the signal DTO itself.

## Function commitClosePending

This function lets you finalize a pending order, essentially closing it without interrupting your strategy's normal operation. Think of it as confirming a trade that was already in progress. It's useful when you want to resolve a pending signal but want the strategy to keep generating and executing signals as usual, and it doesn't affect any signals scheduled for the future. The framework intelligently adapts to whether it’s running a backtest or live trading environment.

You specify the symbol you're trading and can optionally add details like an ID or a note to the confirmation.

## Function commitCancelScheduled

This function allows you to cancel a scheduled signal within your trading strategy. Think of it as telling the system, "forget about that signal we were planning to execute later." 

It's a clean way to discard a scheduled action without interrupting your strategy's overall function—it won't impact any existing orders or prevent the strategy from generating new signals. 

The function recognizes whether it's operating in a backtest or live trading environment automatically.

You can optionally include a payload to document *why* you're cancelling the scheduled signal.


## Function commitBreakeven

This function helps manage your trades by automatically adjusting the stop-loss level. 

Specifically, it moves your stop-loss to your original entry price – essentially turning it into a zero-risk position – once the price has moved favorably enough to cover any transaction fees and a small buffer.

It figures out whether it's running in a backtest or a live trading environment on its own, and it retrieves the current price to make the decision. You just need to provide the trading pair symbol like BTCUSDT.

## Function commitAverageBuy

The `commitAverageBuy` function lets you add a new piece to your dollar-cost averaging (DCA) strategy. It essentially records a purchase at the current market price, adding to your overall entry history for a trade.

The function automatically adjusts its behavior depending on whether you're running a backtest or a live trade. 

It retrieves the current market price for you and also signals that a new average buy has been committed. You can optionally specify a cost, but it isn't required.


## Function commitActivateScheduled

This function lets you manually trigger a scheduled signal before the price actually hits your target level. 

Think of it as a way to proactively acknowledge a scheduled event.

It sets a flag indicating the signal should be activated, and the strategy will handle the rest during its regular processing cycle.

You'll need to provide the symbol of the trading pair.

Optionally, you can include a payload with an ID and note to keep track of why you're manually activating the signal. The framework automatically adjusts to whether it’s running a backtest or a live trade.

## Function checkCandles

The `checkCandles` function is designed to quickly verify if the necessary historical candle data already exists in your persistent storage. It’s a way to avoid unnecessary downloads of large datasets.

Instead of retrieving all the candles, it performs a targeted check to see if each timestamp you need is present. If even one candle is missing or out of place, the entire check fails. 

This function takes parameters to specify the data you're checking for, and returns a promise that resolves when the check is complete.


## Function cacheCandles

The `cacheCandles` function helps to make sure your trading system has the historical price data it needs. It focuses on a specific trading symbol, time interval, start and end dates, and the exchange where the data originates. 

It works in two stages: first, it verifies if the required data already exists. If not, it fetches the missing data and then re-checks to ensure everything is consistent. This process includes optional callbacks to track the start of the validation and warm-up (data retrieval) phases.


## Function addWalkerSchema

This function lets you add a new walker to the backtest-kit system. A walker is essentially a tool that runs multiple trading strategies against the same data and then compares how well they did. 

Think of it as setting up a competition between your strategies to see which one performs best according to a defined measure.

You provide a configuration object, the `walkerSchema`, which tells the walker how to execute and compare these strategies. It’s the key to customizing the comparison process.


## Function addStrategySchema

This function lets you register a new trading strategy within the backtest-kit framework. When you register a strategy, the system automatically checks to make sure your strategy's signals are well-formed – verifying things like price data, stop-loss and take-profit settings, and timestamps.

It also helps prevent a common issue where strategies might generate too many signals too quickly, which can overload the system.

Finally, if you're running tests in a live environment, the framework ensures that your strategy's data can be safely saved even if unexpected errors occur. You provide a configuration object defining your strategy.

## Function addSizingSchema

This function lets you tell the backtest-kit how to determine the size of your trades. It's how you define your risk management strategy.

You provide a sizing configuration, which includes details like whether you’re using a fixed percentage of your capital, a Kelly criterion, or something based on Average True Range (ATR).

The configuration also specifies risk parameters, sets limits on how much you can trade at once, and even allows for custom calculations using callbacks. Essentially, it's all about controlling your risk exposure with each trade.


## Function addRiskSchema

This function lets you define and register risk management rules within the backtest-kit framework. Think of it as setting up guardrails to prevent your trading strategies from taking on too much risk.

You can use it to limit the total number of positions your strategies can hold at once, or implement more complex risk checks, like monitoring portfolio diversification or correlations between assets. 

It’s designed so that multiple strategies can share the same risk management setup, allowing the system to see how your strategies interact and manage risk across them. This shared risk management system keeps track of all active positions and makes that data available for your custom validation functions.


## Function addFrameSchema

This function lets you tell the backtest-kit about a new type of timeframe you want to use for your backtesting. Think of it as defining how your data will be sliced up into periods for analysis. You provide a configuration object that outlines the start and end dates of your backtest, the interval (like daily, weekly, or hourly), and a way to generate those timeframes. By registering these schemas, backtest-kit knows how to properly handle and work with your specific timeframe requirements. It's essential for customizing your backtesting to match your data and strategy.


## Function addExchangeSchema

This function lets you tell the backtest-kit framework about a new data source for exchange information. Think of it as registering where the framework can find historical price data, how to format prices and quantities for the exchange, and how to calculate key indicators like VWAP. You’ll need to provide a configuration object that defines the specifics of the exchange you’re working with. This registration step is crucial for the backtest-kit to properly access and utilize the data for your trading strategies.


## Function addActionSchema

This function lets you plug in custom actions that get triggered during your backtesting or live trading. Think of actions as a way to automatically do things based on events happening in your strategy, like when a trade hits a certain profit level or a new signal appears.

You can use these actions to handle things like updating state in a tool like Redux, sending notifications to a Discord channel, logging events, or even triggering other business logic. 

Each action is created specifically for each unique combination of strategy and timeframe, ensuring the action receives all relevant events, such as trade signals, profit/loss updates, and more. The `actionSchema` parameter contains all the necessary details to configure how this action behaves.
