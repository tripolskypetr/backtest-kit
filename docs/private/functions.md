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

The `writeMemory` function lets you store data within a specific memory space, useful for keeping track of things during a trade. Think of it like creating labeled containers for information related to a particular signal. 

It handles the technical details of where and when to store this data, adjusting based on whether you're running a test or a live trade.

You provide a name for the memory bucket, a unique ID for the specific memory location within that bucket, the actual data you want to store (which can be anything from a simple number to a complex object), and a description for what the data represents. The function then takes care of saving that data and ensuring it's accessible within your trading logic.


## Function warmCandles

This function helps prepare your backtesting environment by proactively downloading and storing historical candle data. It’s useful when you need to ensure that all the necessary data is readily available before running a backtest, avoiding delays caused by fetching it on the fly. It essentially pre-loads candles for a specified date range, from a starting point to an ending point, which can significantly speed up your backtest execution. You provide parameters to specify the date range and interval for the candles you want to cache.

## Function waitForReady

This function is a helpful tool for ensuring everything is set up correctly before you start a backtest or live trading session. It waits patiently, checking periodically, until all the necessary components – like the data registries for exchanges, trading strategies, and historical data frames – are loaded and ready to go. 

If you're doing a backtest, it makes sure all three of these are in place. For live trading, only the exchange and strategy registries are needed, as historical data isn't used. 

It's designed to be used during startup when these registries are being loaded asynchronously. If it can't find all the required registries within a certain timeframe, it simply completes without error, allowing a subsequent error to appear from the actual backtest or live execution, so you know something went wrong and can troubleshoot it.


## Function validate

This function helps ensure everything is set up correctly before you run a backtest or optimization. It checks that all the components you're using – like exchanges, trading strategies, and risk management settings – actually exist and are properly registered.

You can tell it to validate specific parts of your setup by providing details, or if you want to be thorough, you can ask it to check *everything*.

The validation results are saved to improve speed if you run it again. Think of it as a quick health check for your trading framework.

## Function stopStrategy

This function allows you to halt a trading strategy's signal generation. 

It essentially pauses the strategy, preventing it from creating any new trades. 

Any existing open trades will still finish normally. 

The system will gracefully stop the backtest or live trading session at a suitable moment, usually when there's a pause or a trade has concluded.

You provide the trading symbol (like BTCUSDT) to specify which strategy to stop. The function automatically figures out whether it’s running a backtest or a live trade.

## Function shutdown

This function provides a way to properly end a backtest run. It signals that the testing process is wrapping up, giving all parts of the system a chance to clean up and save any important data before it finishes. Think of it as a polite way to say goodbye, ensuring everything is in order when the backtest ends. You'd usually call this when you want to stop the backtest, like when you press Ctrl+C.

## Function setSignalState

This function helps you manage and update the state of a trading signal. Think of it as a way to keep track of specific information related to a trade as it's happening.

It's designed to work especially well when you’re building strategies that rely on information gathered over time, like tracking how long a trade has been open or the maximum gain it has reached. The function automatically handles knowing whether the system is in backtest mode or live trading mode.

It looks for an active, pending signal and if one isn't found, it will alert you so you can be sure everything is set up correctly. 

Essentially, it's a tool for precisely tracking and managing signal states, particularly useful for complex, data-driven trading approaches.

The function takes a symbol (the trading pair, like BTC/USDT), a way to dispatch data, and a data transfer object that defines the initial state value and a bucket name for organizing the data. It returns a promise resolving to the updated state value.

## Function setSessionData

The `setSessionData` function lets you store information that's specific to a particular trading setup—like a symbol, strategy, exchange, and timeframe—and keep it around even if the backtest or live run is interrupted. Think of it as a temporary scratchpad for your strategy.

You can use it to hold things like the results of calculations that take a lot of time (like those from AI models) or to remember the state of an indicator across different candles. 

If you want to get rid of a piece of session data, just pass `null` as the value. The function automatically knows whether it's running in a backtest or live environment.

You provide the symbol for the trading pair and the data you want to store—which can be any object—or `null` to clear the stored value.

## Function setLogger

This function lets you plug in your own logging system for backtest-kit. It’s handy if you want to see detailed information about how the backtest is running, like which strategy, exchange, and symbol are being tested. You simply provide a logger that follows the `ILogger` interface, and all internal messages will be sent through your custom logger, automatically including helpful context details.

## Function setConfig

This function lets you adjust the overall settings for the backtest-kit framework. Think of it as tweaking the system's behavior behind the scenes. You can provide a set of new settings, and only the ones you specify will be changed—the rest will remain at their default values.  There’s also a special option, `_unsafe`, that you’d use primarily in testing scenarios to bypass certain safety checks on your configuration.

## Function setColumns

This function lets you customize the columns that appear in your backtest reports, like the ones generated for markdown. You can adjust the default column settings to display the information most important to you. It ensures the column configurations are structurally sound before applying them, but there's a special `_unsafe` flag for testing scenarios where you might need to bypass those checks. Think of it as tailoring your report view to focus on the data you need.

## Function searchMemory

The `searchMemory` function helps you find relevant data stored in your memory based on a search term. It uses a powerful technique called BM25 to rank the results, ensuring the most important entries appear first.

Think of it like a search engine for your data—you provide a `bucketName` (where the data is stored) and a `query` (what you're looking for), and it returns a list of matching memory entries along with a score indicating their relevance.

Crucially, this function intelligently handles the execution environment; it figures out whether it's running a backtest or a live trading session automatically, so you don't need to worry about setting things up differently based on the mode. It also automatically resolves signals.

The function returns an array of objects, each containing the memory's ID, its score, and the content itself, allowing you to easily retrieve and work with the data you find.


## Function runInMockContext

This function lets you run code snippets as if they were part of a trading strategy, but without actually needing a full backtest environment. It’s handy for writing tests or simple scripts that rely on things like the current time or strategy information.

You can customize the environment it simulates, setting things like the exchange name, strategy name, trading symbol, and whether it’s in backtest mode or live mode. If you don’t provide any settings, it defaults to a basic, live-mode environment.

Essentially, it provides a safe space to test code that depends on the trading context without needing a complicated setup. The `when` parameter defaults to the current minute, allowing for time-sensitive operations within the mock context.


## Function removeMemory

This function lets you delete a specific memory entry associated with your trading signal. Think of it as cleaning up old data that’s no longer needed.

It automatically handles the current trading environment, whether you're in backtesting or live trading. 

To use it, you’ll provide the name of the memory bucket and the unique ID of the memory entry you want to remove.


## Function readMemory

The `readMemory` function lets you fetch data stored in memory, associating it with the context of the trading signal you're working with. Think of it as retrieving previously saved information needed for your calculations. It cleverly figures out whether you're running a backtest or live trading and automatically handles signal resolution for you. 

You provide a simple object that specifies the name of the memory bucket and the unique ID of the memory item you want to retrieve. The function then returns a promise that resolves to the data stored under that ID, typed to the object you defined.

## Function overrideWalkerSchema

This function lets you adjust how your trading strategy's historical data is processed when you're comparing different strategies. Think of it as fine-tuning the "walker" that steps through your backtest data.

You can provide just the parts of the walker's configuration you want to change, leaving everything else as it was originally set up. This is useful when you want to modify a specific aspect of the data processing without completely redefining the whole walker. It returns a promise that resolves to the updated walker configuration.

## Function overrideStrategySchema

This function lets you modify a trading strategy that's already set up within the backtest-kit framework. Think of it as a way to tweak an existing strategy—you don't rebuild it from scratch. You provide a small piece of updated configuration, and it’s applied to the original strategy, leaving the rest of its settings untouched. It’s really handy for making adjustments without affecting the whole strategy’s setup.


## Function overrideSizingSchema

This function lets you adjust an existing position sizing strategy without completely replacing it. Think of it as fine-tuning – you can change specific settings within a sizing schema, like the amount of capital allocated per trade, while keeping the rest of the strategy's logic untouched. You provide a partial configuration, and the framework merges it with the original sizing schema. This is useful if you need to make small adjustments based on changing market conditions or portfolio requirements. The provided configuration updates only affect the fields you specify.

## Function overrideRiskSchema

This function lets you adjust a risk management setup already in place. Think of it as making targeted changes—you provide a set of new settings, and those specific parts of your existing risk configuration get updated. The rest of your original settings stay exactly as they were. It's a way to refine your risk management without completely rebuilding it from scratch. You provide a partial configuration, and the function handles applying those changes.

## Function overrideFrameSchema

This function lets you modify the settings for a specific timeframe you're using in your backtest. Think of it as tweaking an existing timeframe’s definition, rather than creating one from scratch.

You provide a piece of the timeframe’s configuration – just the parts you want to change – and this function will update the original timeframe definition accordingly. Any settings you don't include in your provided configuration will stay as they were. It’s a way to make targeted adjustments to how your backtest handles different timeframes.


## Function overrideExchangeSchema

This function lets you modify an already set-up data source for an exchange within the backtest-kit framework. Think of it as a way to tweak existing exchange settings without completely redefining them.  You provide a partial configuration – just the parts you want to change – and the function will update the original exchange data source, keeping the rest of its settings as they were. This is useful for making small adjustments or corrections to exchange configurations after they've already been registered.

## Function overrideActionSchema

This function lets you tweak existing action handlers within the backtest-kit framework without having to completely recreate them. Think of it as a targeted update – you can change specific parts of an action’s configuration, like its logic or callbacks, while leaving everything else untouched. This is really handy if you need to adapt your handlers for different environments, switch between implementations, or fine-tune their behavior without altering the core strategy. You simply provide the fields you want to change, and the function handles the rest, updating the existing action schema.

## Function listenWalkerProgress

This function lets you track the progress of a backtest as it runs. 

It provides updates after each strategy finishes, giving you insights into how the backtest is proceeding.

Importantly, the updates are delivered one at a time, even if your update code takes some time to complete, ensuring things don't get out of order or overwhelmed. To stop listening for these progress updates, the function returns a cleanup function that you can call.

## Function listenWalkerOnce

This function lets you set up a listener that reacts to specific events happening during a backtest. You provide a filter – essentially a rule – that determines which events you’re interested in. Once an event matches your filter, a callback function you provide will run. The magic is that this listener automatically turns itself off after it has executed once, so you don’t need to worry about cleaning up subscriptions.

Think of it as waiting for a particular signal to appear during the backtest process and then taking action based on that signal.

Here's a breakdown of how it works:

*   `filterFn`: This defines the conditions that an event must meet to trigger the callback.
*   `fn`:  This is the function that will be executed *only once* when an event satisfies the filter.

It's a handy way to monitor progress and respond to events without the complexity of managing ongoing subscriptions.


## Function listenWalkerComplete

This function lets you be notified when a backtest run finishes. It's designed to handle situations where processing the completion information might take some time.

You provide a function that will be called once the backtest is complete. This function will receive an event object containing details about the completion.

Importantly, the backtest-kit ensures that these completion notifications are processed one at a time, even if the function you provide takes time to execute, preventing any potential issues caused by simultaneous operations. This allows you to safely and reliably respond to backtest completion.


## Function listenWalker

The `listenWalker` function lets you keep track of how a backtest is progressing. It’s like setting up a notification system that tells you when each strategy finishes running within a backtest.

This function provides a way to receive these updates one at a time, even if processing each update takes some time – it handles the queuing for you. You provide a function that gets called for each strategy, and that function receives information about the strategy's completion. This is useful for displaying progress or performing actions as the backtest runs.


## Function listenValidation

This function lets you keep an eye on any problems that pop up during the risk validation process – that's when the framework checks if your trading signals are okay. 

It's like setting up an alert that goes off whenever something goes wrong.

The `fn` you provide is the thing that gets triggered when an error occurs, and it receives information about the error itself.

Importantly, any errors are handled one at a time, in the order they happen, even if your error-handling code takes some time to run. This helps to keep things stable.


## Function listenSyncOnce

This function lets you listen for specific synchronization events, but only once. It’s helpful when you need to coordinate actions within your backtest with something happening outside of it, like an external system.

The `filterFn` lets you define exactly which events you're interested in – the callback will only run when an event matches your criteria. 

The `fn` is the function that gets executed once for a matching event. Importantly, if this function returns a promise, the backtest will pause and wait for that promise to resolve before continuing.

Finally, the `warned` parameter is an internal flag. You likely won't need to worry about it.

This one-time subscription prevents repeated executions and ensures that your external synchronization happens correctly.


## Function listenSync

This function lets you react to signals that are being processed, like when a trade is about to open or close. It's especially handy if you need to coordinate with other systems during these moments.  The callback function you provide will be triggered for each synchronization event, and if that function involves asynchronous operations (like promises), the trading process will pause until those operations finish. This ensures everything stays in sync. You can also optionally suppress a warning message.

## Function listenStrategyCommitOnce

This function lets you react to specific changes in your trading strategies, but only once. It's like setting up a temporary alert – you specify what kind of change you're interested in, and when that change happens, a function runs and then the alert automatically goes away. This is helpful if you need to perform an action based on a strategy's initial setup or a particular adjustment. 

You tell it what to look for with a filter, and then you define what should happen when a matching event occurs. The function takes care of setting up the listener and automatically stopping it after the event triggers, so you don't have to worry about cleaning up.

## Function listenStrategyCommit

This function lets you keep an eye on what's happening with your trading strategies – specifically, changes to their settings and actions taken. It's like setting up a notification system that tells you when things like stop-loss orders are adjusted, signals are cancelled, or partial profits are realized.

The system ensures these notifications are handled one at a time, even if your notification routine takes some time to process, preventing conflicts and ensuring order.

To use it, you provide a function that will be called whenever a relevant event occurs, and this function will receive details about the specific action that triggered the notification. When you're done listening, the function returns another function that you can call to unsubscribe.

## Function listenSignalOnce

This function lets you react to a specific signal event just once and then stop listening. You provide a filter—a way to describe exactly which signal you're interested in—and a function that will run when that signal arrives. It automatically takes care of subscribing and unsubscribing, so you don't have to manage those details yourself.

Think of it as a way to say, "Hey, run this code when you see this particular type of signal, but only do it once."

It's handy when you need to wait for a certain condition to be met within the trading signals and then perform an action.


## Function listenSignalNotifyOnce

This function lets you set up a listener that reacts to specific trading signals, but only once. 

You tell it what kind of signals you’re interested in using a filter – essentially, a rule that checks each incoming signal.

Then, you provide a function that will be executed when a signal matches your rule. 

Once that function has run once, the listener automatically stops, so you don't need to worry about cleaning it up. It's a handy way to react to a single occurrence of a particular signal condition.


## Function listenSignalNotify

This function lets you listen for notifications whenever a trading strategy shares information about its signals—essentially, notes about open positions. 

Think of it as a way to be informed about what's happening within a strategy’s trading decisions.

The system makes sure these notifications are delivered one at a time, even if the process of handling them takes some time.

You provide a function that gets called whenever a new notification arrives, receiving details about the signal.

To stop listening for these notifications, the function returns another function that you can call to unsubscribe.

## Function listenSignalLiveOnce

This function lets you briefly tap into the live signals generated during a backtest to react to a specific event just once. Think of it as setting up a temporary listener that only fires when a certain condition is met. 

It's designed to work with events coming directly from a live backtest execution. 

You provide a filter – a function that decides which events you're interested in – and a callback function that will be executed when that event happens. Once the event is caught, the listener automatically shuts itself down.


## Function listenSignalLive

This function lets you tap into the live trading signal flow when using `Live.run()`. It provides a way to receive and react to events as they happen in real-time.

You give it a function (`fn`) that will be called whenever a new trading signal event arrives. This callback function will receive data about the event, allowing you to use that information for things like displaying updates, triggering actions, or other reactive tasks.

Keep in mind that events are processed one at a time, guaranteeing order.  It's a straightforward way to monitor and respond to live trading activity. The function returns a function to unsubscribe.


## Function listenSignalBacktestOnce

This function lets you listen for specific events happening during a backtest run, but it only triggers once. Think of it as setting up a temporary alert.

You tell it what kind of event you're interested in using a filter – a function that checks each event. When an event matches your criteria, a callback function you provide will be executed just once. After that, the listener is automatically removed, so you don't have to worry about cleaning up.

It only works with events generated during a `Backtest.run()` execution. 

Here's what you need to provide:

*   A filter function: This decides which events you want to see.
*   A callback function: This is what happens when a matching event occurs.


## Function listenSignalBacktest

This function lets you hook into the backtest process to react to events as they happen. It’s like setting up an observer to listen for updates during a backtest run.

Essentially, you provide a function that gets called whenever a signal event occurs, and that function will receive the details of that event. 

Keep in mind, this only catches events generated when you're actively running a backtest using `Backtest.run()`, and the events are handled one after another, ensuring they're processed in the correct order. This is particularly useful for monitoring progress or triggering actions based on the backtest's behavior.


## Function listenSignal

This function lets you listen for updates from your trading strategy – things like when a trade is opened, active, or closed. It's designed to be reliable even if your callback function takes some time to process these updates because it handles them one at a time, in the order they arrive. You provide a function that will be called whenever a signal event occurs, and it returns a function you can use to unsubscribe later.

## Function listenSchedulePingOnce

This function lets you react to specific ping events, but only once. 

It subscribes to incoming ping events and checks them against a filter you provide. When a matching event arrives, it triggers a callback function you define. 

After that one successful execution, the function automatically stops listening, so you don't need to manage the subscription yourself. This is perfect for situations where you need to respond to a specific condition appearing in a ping event just once.

You provide a function to decide which events are relevant (the `filterFn`) and a function to execute when a matching event is found (the `fn`). The function returns a function that can be called to unsubscribe.

## Function listenSchedulePing

This function lets you keep an eye on scheduled signals—those that are waiting to become active—by listening for regular ping events. Every minute, while a scheduled signal is waiting, you'll receive a notification. This is helpful if you need to track the progress of these signals or implement your own custom monitoring procedures. Essentially, it gives you a way to be informed about what's happening behind the scenes with your scheduled trading signals.

The function takes a callback function as input, which gets executed each time a ping event occurs. You provide this callback to define what happens when a ping event is received.  The function itself returns another function that you can use to unsubscribe from these ping events whenever you need to stop listening.


## Function listenRiskOnce

This function lets you temporarily listen for specific risk rejection events and react to them just once. Think of it as setting up a temporary guardrail – it waits for a particular condition to happen, triggers your code to respond, and then automatically removes itself. This is handy when you need to react to a specific risk condition and then stop listening.

You provide a filter to define what kind of risk events you're interested in, and then a function that will be executed when that event occurs. Once that event happens, your function runs, and the listener is automatically deactivated, preventing further calls.

## Function listenRisk

This function lets you tap into notifications when a trading signal is blocked because it fails a risk check. 

Think of it as a way to be alerted *only* when something goes wrong with your risk management, not when everything is working fine.

The function ensures these notifications are handled one at a time, even if your notification code takes some time to complete, preventing issues caused by running multiple things at once. You provide a function that gets called when a signal is rejected – that's your code to handle the problem. The function returns another function that unsubscribes from these notifications when you’re done.

## Function listenPerformance

This function lets you keep an eye on how long different parts of your trading strategy take to run. It's like having a performance monitor that sends you updates as your strategy executes.

You provide a function that will be called whenever a performance metric is recorded. This allows you to pinpoint slow operations and potential bottlenecks in your code.

Importantly, these performance updates are processed one at a time, even if your callback function takes some time to complete. This prevents things from getting messy with multiple callbacks running at the same time.

To stop listening for these updates, the function returns another function that you can call to unsubscribe.

## Function listenPartialProfitAvailableOnce

This function lets you set up a listener that reacts to specific profit-related events in your trading strategy, but only once. You define a condition – a filter – and when that condition is met, a function you provide gets executed. After that single execution, the listener automatically stops, making it perfect for scenarios where you need to react to a particular profit milestone just one time. It’s a clean way to trigger actions based on profit conditions without needing to manage the subscription yourself.


## Function listenPartialProfitAvailable

This function lets you listen for specific profit milestones being reached during a backtest or live trade. It's like setting up alerts for when your trading strategy hits 10%, 20%, or 30% profit. 

Whenever one of these milestones is hit, it will trigger the function you provide as input. Importantly, these events are handled one at a time, in the order they happen, even if your function takes some time to run. This ensures that things don't get out of order or overloaded. You'll get a function back that you can call to stop listening for these events.


## Function listenPartialLossAvailableOnce

This function allows you to set up a one-time alert for when a specific partial loss condition occurs. You provide a filter that describes the condition you're looking for, and a function that will be executed when that condition is met. Once the event happens and the function runs, the subscription is automatically removed, so you won't get any further notifications. 

Think of it like setting a single, temporary listener for a particular loss event.

It takes two arguments: a filter function to identify the events you care about and a function to be called when a matching event is found. The function returns an unsubscribe function to stop listening if needed.

## Function listenPartialLossAvailable

This function lets you keep track of how much a trading strategy has lost. It sends you notifications whenever the loss reaches certain milestones, like 10%, 20%, or 30% of the initial capital. 

These notifications are delivered one at a time, and the processing of each notification happens in order, even if your notification handler involves asynchronous operations. This ensures that your loss tracking logic executes safely and predictably, preventing issues that might arise from multiple callbacks running simultaneously. You provide a function that will be called with details about each loss milestone event. The function will return an unsubscribe function that you can use to stop receiving the events.

## Function listenMaxDrawdownOnce

This function helps you keep an eye on max drawdown events, but only wants to react once when a specific condition is met. You provide a filter – essentially a rule – to identify the drawdown events you're interested in. Once an event matches your filter, this function will execute a callback you define, and then automatically stop listening. It's perfect for scenarios where you need to take action only once based on a particular drawdown situation. 

You give it two things: a way to decide which drawdown events are important, and what you want to do when one of those events happens. After that one action, the listening stops.

## Function listenMaxDrawdown

This function lets you keep an eye on when your trading strategy hits new drawdown lows during a backtest. 

It's like setting up a notification system – whenever a new maximum drawdown is reached, your provided function will be called.

Importantly, these notifications are handled one at a time to avoid any issues that might arise from running callbacks simultaneously.

You can use this to monitor how much your strategy has lost at its worst point, and potentially adjust your approach based on those observations.

To use it, you give it a function that will execute when a drawdown event occurs. The function you provide will receive information about the drawdown event.


## Function listenIdlePingOnce

This function lets you react to events indicating periods of inactivity in your application. It allows you to specify a condition – a filter – to only trigger an action when a specific type of idle ping occurs.  Importantly, the provided function (the callback) will only run *once* when the condition is met, and then the subscription will automatically stop. This is useful for things like temporary cleanup or initiating a short, one-off process during downtime. You provide a way to identify the events you care about and the code you want to execute when a matching event happens.

## Function listenIdlePing

This function lets you listen for moments when your backtest environment is completely idle – meaning there are no trades being processed or scheduled.

It's like a notification that tells you everything is quiet.

You provide a function that will be called whenever this idle state is detected. The function receives an `IdlePingContract` object that provides details about the idle ping event.

Essentially, it helps you monitor and react to periods of inactivity in your backtest.


## Function listenHighestProfitOnce

This function lets you set up a listener that only runs once when a specific trading condition is met, related to the highest profit achieved. You provide a filter—essentially, rules that determine when to trigger the listener—and a function to execute when that condition is met. Once the filter matches an event, your function runs and the listener automatically stops, so it won't react to any more events.

It's handy if you need to react to a particular profit milestone and then immediately stop monitoring.

The filter function defines what "highest profit" event you're looking for.
The callback function is what happens when that profit event occurs.


## Function listenHighestProfit

This function lets you keep an eye on when your trading strategy hits a new peak profit level. 

It's like setting up a listener that gets notified whenever the strategy's profit reaches a new high.

The listener works in a special way: it makes sure events are processed one at a time, even if your callback function takes a bit of time to complete – this avoids any unexpected issues.

You can use this to track important milestones in your strategy's performance or even automatically adjust things based on how it's doing. 

To use it, you provide a function that will be called whenever a new highest profit level is achieved, and it returns a way to unsubscribe from these notifications later.

## Function listenExit

The `listenExit` function lets you react to the most serious errors that can halt a backtest or live trading process. Think of it as a last-line-of-defense mechanism—if something goes critically wrong and stops everything, this is how you’ll know.

It's designed for errors that are so severe they cause the whole backtest or live execution to stop. This differs from catching minor issues, which you might want to recover from.

The function takes a callback – a piece of code that gets executed when a fatal error occurs. The error details are passed to this callback, allowing you to log them or take other corrective actions, although recovery isn't typically possible.

Importantly, `listenExit` ensures that these error responses happen one at a time, even if the callback you provide involves asynchronous operations. This prevents a chaotic situation where multiple error handlers are running concurrently.


## Function listenError

The `listenError` function lets you set up a way to catch and deal with errors that might happen while your trading strategy is running, but aren't critical enough to stop everything. Think of it as a safety net for things like temporary API connection problems. 

When an error occurs, the function will call the callback you provide.  The good part is that it handles these errors one at a time, in the order they happen, so your strategy doesn't get overwhelmed. This ensures that any cleanup or retry logic you put in your callback gets executed correctly without causing further problems.

## Function listenDoneWalkerOnce

This function lets you listen for when a background process finishes, but only once. It's useful when you need to react to a specific completion event and then stop listening. You provide a filter to select which completion events you’re interested in, and a function that will be executed when a matching event occurs. Once that function has run, the listener automatically stops, preventing it from firing again. This provides a clean way to handle one-off reactions to background process completions.

## Function listenDoneWalker

This function lets you listen for when background tasks managed by the walker have finished. Think of it as a way to be notified when a series of operations are fully processed. The notifications arrive one at a time, and even if your response to a notification involves asynchronous work, it won't interfere with subsequent notifications. It ensures that these completion events are handled in a controlled, sequential manner. You provide a function that will be called whenever a background task completes. The function you provide is responsible for handling the `DoneContract` event data.


## Function listenDoneLiveOnce

This function lets you react to when background tasks, started with `Live.background()`, finish running. Think of it as setting up a temporary listener that only fires once. 

You provide a filter—a way to specify which completed tasks you're interested in—and a callback function that gets executed when a matching task completes. Once the callback runs, the listener automatically disappears, preventing further notifications. It’s a clean way to handle those one-off completion signals.

## Function listenDoneLive

This function lets you monitor when background tasks initiated by `Live.background()` are finished. 

It's designed to handle these completion notifications in a reliable, sequential order, even if the function you provide needs to do some asynchronous work.

Essentially, you give it a function that will be called when a background task is done, and it ensures that this function runs one at a time. 

The function returns another function that you can use to unsubscribe from these events later if needed.

## Function listenDoneBacktestOnce

The `listenDoneBacktestOnce` function lets you react to when a background backtest finishes, but only once. You provide a filter to specify which backtest completions you're interested in, and then a function to run when that specific backtest is done. Once the callback has run, it automatically stops listening, ensuring it won't trigger again for the same backtest. This is useful for single-time cleanup or notification tasks related to a finished backtest.


## Function listenDoneBacktest

This function lets you get notified when a background backtest finishes running. 

It's like setting up an alert that goes off when a task is done.

The alert (or callback function you provide) will be triggered once the backtest is complete.

Importantly, even if your alert function does something that takes time (like making an asynchronous call), the alerts will still be delivered one after another, in the order they happened. This ensures things happen in a controlled sequence.


## Function listenBreakevenAvailableOnce

This function lets you set up a temporary listener for when a certain breakeven condition is met in your trading setup. You define a filter – essentially, the specific condition you’re looking for – and a function that should run *once* when that condition appears. After that single execution, the listener automatically stops, so you don't have to worry about cleaning it up manually. It's a handy way to react to a specific breakeven event and then move on.

The `filterFn` determines which events trigger the callback.

The `fn` will be executed only once when a matching event is detected.

## Function listenBreakevenAvailable

This function lets you track when a trade's stop-loss is automatically adjusted to breakeven, meaning it's moved back to the original entry price. This happens when the trade has made enough profit to cover any fees and potential slippage.

The function provides a way to react to these breakeven events, ensuring that your reaction to them happens in a controlled, sequential order, even if your reaction involves asynchronous operations. 

You provide a function to be called when a breakeven event occurs, and the function itself returns another function that you can use to stop listening for these events.


## Function listenBeforeStartOnce

This function lets you react to specific events that happen right before a backtest starts, but only once. You provide a filter to define which events you're interested in, and a function that gets executed when a matching event occurs. After that one execution, the subscription is automatically removed, so you don't have to worry about cleaning up. It's a convenient way to perform a one-time setup or adjustment based on the initial backtest conditions.

You specify a condition to identify the relevant events and then provide a function that will run exactly once when an event meets that condition. 


## Function listenBeforeStart

This function lets you hook into the very beginning of a strategy's run for a particular trading symbol. 

Think of it as a signal that’s sent just before a strategy begins analyzing and potentially trading. 

You provide a function that gets called when this event happens, and it will be executed one at a time to avoid any issues with timing. This makes sure your code runs smoothly and in the correct order. It's useful for setting up initial conditions or doing preparatory steps before the strategy kicks off.


## Function listenBacktestProgress

This function lets you monitor the progress of a backtest as it runs. It’s designed to give you updates during the background processing of a backtest. You provide a function that will be called whenever a progress event occurs, and this function will be executed one after another, even if it involves asynchronous operations. Essentially, it gives you a way to keep tabs on what’s happening behind the scenes during your backtest.

It returns a function that you can use to unsubscribe from these progress updates later if needed.


## Function listenAfterEndOnce

This function lets you react to specific events that happen after a trading simulation or backtest concludes. You provide a filter – essentially a rule – to identify the events you're interested in. Then, you give it a function to run when a matching event occurs. The best part? Once that function has run *once*, the subscription is automatically turned off, so you won’t be bothered by further events. This is really useful for things like performing one-time cleanup or calculations after a backtest completes.

It simplifies handling those final events without needing to manually manage subscriptions.


## Function listenAfterEnd

This function lets you hook into what happens after a trading strategy finishes running for a specific asset. It's useful for tasks that need to happen after the main backtest process is complete, like saving results or performing cleanup. 

Events are handled one at a time, even if your callback function takes some time to execute, ensuring things don't get messed up by running in parallel. The function returns an unsubscribe function so you can easily stop listening for these events when you no longer need them. You provide a function that will be called with information about the completed backtest run.

## Function listenActivePingOnce

This function lets you react to specific active ping events, but only once. You tell it what kind of event you’re looking for using a filter, and when that event happens, it runs your provided callback function. After that single execution, it automatically stops listening, so you don't have to worry about cleaning up the subscription yourself. It's perfect when you need to respond to a particular ping condition just one time.

It takes two things: a filter function that defines what event you're interested in and a callback function to handle that event. The filter function checks the incoming event and the callback function gets executed only once when the filter finds a matching event.


## Function listenActivePing

This function lets you keep an eye on active signals within the backtest-kit framework. It provides a way to be notified whenever a signal's status changes—essentially, it's listening for "ping" events.

You'll receive these events roughly every minute, allowing you to monitor the lifecycle of your signals and react accordingly. 

The function is designed to handle these events in a controlled way: even if your callback function takes some time to process each event, they'll be processed one at a time in the order they arrive, preventing any unexpected conflicts. To start listening, you provide a function that will be called with each active ping event. When you're finished listening, the function returns another function that you can call to unsubscribe.

## Function listWalkerSchema

This function gives you a look at all the different trading strategies (walkers) that are currently set up in the backtest-kit system. It essentially provides a list of configurations for each strategy, which can be helpful if you're trying to understand how your system is structured or build tools to manage those strategies. Think of it like a directory listing of all your active trading rules.

## Function listStrategySchema

This function lets you see a list of all the different trading strategies that are currently set up and ready to use within the backtest-kit framework. Think of it as a way to check what strategies you’ve defined and registered. It's handy for things like figuring out what's going on behind the scenes, creating documentation, or if you want to build a user interface that automatically displays the available strategies. The result is a list of strategy descriptions, each detailing how a particular trading approach works.

## Function listSizingSchema

This function gives you a list of all the different sizing strategies that are currently active in your backtest setup. Think of sizing as how much of an asset you trade each time. This function is helpful if you need to see exactly what sizing options are available, maybe to check for errors or to build a display showing your configurations. It essentially provides a snapshot of all sizing schemas that have been previously added.

## Function listRiskSchema

This function gives you access to a list of all the risk configurations that have been set up in your backtest. Think of it as a way to see all the rules and parameters you've defined for managing risk during your simulations. It's handy for checking your work, generating documentation, or creating user interfaces that adapt to your specific risk settings. The function returns a promise that resolves to an array of risk schema objects.


## Function listMemory

This function helps you view all the stored memories associated with the current signal. It’s like looking through a logbook of past events or data related to your trading strategy.

The function takes a simple configuration object, specifying the name of the memory bucket you want to inspect.

It automatically figures out whether you're in a backtesting or live trading environment and also identifies the relevant signal without you needing to specify it directly.

The function returns a list of memories, where each memory includes a unique identifier and its content, structured according to your defined data type.

## Function listFrameSchema

This function provides a way to see all the different data structures, or "frames," that your backtesting environment understands. Think of it as a catalog of all the data types your strategies and analysis can work with. It's really handy when you're trying to understand how your backtest is organized, creating documentation, or building tools that need to know what kinds of data are available. It returns a list of these defined schemas, essentially giving you a peek under the hood of your backtest setup.

## Function listExchangeSchema

This function helps you discover all the exchanges that your backtest-kit setup knows about. It essentially gives you a complete list of available exchanges, each described by its schema. This is handy if you're trying to understand your system's configuration, build a user interface that adapts to different exchanges, or simply debug something. Think of it as a way to peek behind the curtain and see exactly what exchanges are integrated into your backtesting environment.

## Function hasTradeContext

This function simply tells you if the trading environment is ready for actions. 

It verifies that both the execution and method contexts are active. 

If it returns `true`, it means you can safely use functions like `getCandles` or `formatPrice` which rely on having a complete trading context. If it's `false`, you'll need to ensure the environment is properly initialized before proceeding.


## Function hasNoScheduledSignal

This function helps you check if a scheduled signal is currently active for a specific trading symbol. It returns `true` if there isn’t a scheduled signal, which is useful if you want to prevent signal generation when a signal is already planned. The function intelligently determines whether it's running in backtesting or live trading mode, so you don't need to worry about that detail. You provide the symbol – like "BTCUSDT" – and it tells you whether a signal is waiting to be triggered. Think of it as the opposite of `hasScheduledSignal`, helping you make sure your signal logic runs only when intended.

## Function hasNoPendingSignal

This function helps you check if there’s a pending signal currently active for a specific trading pair, like "BTCUSDT". It returns `true` if there isn't a pending signal, and `false` if there is. Think of it as the opposite of `hasPendingSignal` – use it to ensure your signal generation process only runs when appropriate. It figures out whether you’re in backtesting mode or live trading automatically, so you don’t need to worry about that. You simply provide the symbol you want to check.

## Function getWalkerSchema

The `getWalkerSchema` function helps you find information about a specific trading strategy or component within your backtesting setup. Think of it as looking up the blueprint for a particular part of your automated trading system. You give it the name of the strategy—like "SimpleMovingAverage"—and it returns a detailed description of how that strategy works, including what data it needs and what actions it can take. This is useful for understanding and debugging your trading strategies.


## Function getTotalPercentClosed

The `getTotalPercentClosed` function helps you figure out how much of a position you still have open. It tells you the percentage, where 100 means you haven't closed anything and 0 means the position is completely closed.

If you’ve been gradually adding to your position through dollar-cost averaging (DCA), this function accurately reflects the percentage even when you've closed parts of the position along the way.

It automatically knows whether it's running in a backtesting or live trading environment.

To use it, you just need to provide the symbol of the trading pair, like "BTCUSDT".

## Function getTotalCostClosed

This function helps you figure out how much money you've spent acquiring a position you still hold. It calculates the cost basis in dollars, and importantly, it takes into account if you've been gradually building your position through dollar-cost averaging (DCA) and have made partial sales along the way. The function automatically determines whether it's running in a backtest or a live trading environment. You just need to provide the trading pair symbol, like "BTCUSDT," to get the total cost.


## Function getTimestamp

The `getTimestamp` function provides a way to retrieve the current timestamp within your trading strategies. It's handy for knowing precisely when an event occurred, whether you're running a simulation (backtest) or live trading. When backtesting, it will give you the timestamp associated with the current bar or timeframe being analyzed.  If you're trading in real-time, it returns the current system time. Essentially, it helps you keep track of time accurately in your trading environment.

## Function getSymbol

This function allows you to find out which asset you’re currently trading, such as 'BTCUSDT'. It retrieves this symbol directly from the environment the backtest or trading simulation is running in, returning it as a promise that resolves to a string. Essentially, it tells you what you're working with.

## Function getStrategySchema

The `getStrategySchema` function lets you look up the blueprint for a specific trading strategy you've registered within the backtest-kit framework. You give it the strategy's unique name, and it returns a detailed description of how that strategy is structured – things like the inputs it expects, the data types it uses, and the overall layout. This is helpful if you need to dynamically generate forms for users to configure strategies or validate that a strategy is set up correctly. Essentially, it provides a way to understand the expected format of a registered strategy.


## Function getSizingSchema

This function helps you find a specific sizing strategy that's been set up within your backtesting environment. It takes the name of the sizing strategy as input – think of it as an identifier – and returns the detailed configuration for that strategy. Essentially, it’s a lookup tool to get all the information about how a particular sizing strategy works. You can use this to understand or adjust how your trades are sized.

## Function getSignalState

The `getSignalState` function helps you retrieve a specific value associated with the currently active trading signal. It automatically figures out whether you're in a backtesting or live trading environment.

If there isn’t an active signal, it will alert you and return a default value you provide.

This function is particularly useful for strategies that track details on a per-trade basis, like how long a trade is open or its percentage gain, across multiple ticks. It’s designed for advanced strategies looking to manage risk, aiming for modest profits while avoiding significant losses, and might involve exiting trades based on specific time or performance criteria.

You need to provide the trading symbol and a data transfer object containing the bucket name and an initial value for the state you’re tracking.

## Function getSessionData

This function lets you access data that's saved specifically for a particular trading symbol during a backtest or live trading session. Think of it as a place to store information that needs to be remembered between candles, like the results of complex calculations or the state of an indicator.  Importantly, this data sticks around even if the program restarts during live trading.

You provide the trading symbol (like "BTC-USD") and the function will return the associated data, or `null` if no data exists for that symbol. This is particularly helpful for tasks like caching the output of AI models or keeping track of calculations that need to span multiple candles. The framework automatically figures out whether it's running a backtest or live trading session.

## Function getScheduledSignal

This function lets you check what scheduled signals are currently in effect for a particular trading pair. It retrieves the most recent signal that’s been planned, which might influence trading decisions. If no scheduled signal is active for that symbol, it won't return anything – it'll be like the signal doesn’t exist. The function smartly figures out whether it's running in a backtesting simulation or a live trading environment without you needing to tell it. To use it, you just need to specify the symbol, like "BTCUSDT."

## Function getRiskSchema

This function helps you fetch details about a specific type of risk that your backtesting strategy is managing. Think of it as looking up the blueprint for how a particular risk is calculated and handled. You provide a unique name identifying the risk, and it returns a structured description of that risk – outlining its properties and how it's used in the backtest. It’s useful for understanding and customizing how risks are assessed during your simulations.

## Function getRawCandles

The `getRawCandles` function allows you to retrieve historical candlestick data for a specific trading pair and time interval. You have a lot of control over the data you get – you can specify the number of candles to fetch, or provide start and end dates to get data within a particular time range.

The function automatically adjusts its behavior based on the dates you provide, ensuring that your backtesting doesn't accidentally peek into the future.

Here's a breakdown of how to use it:

*   You can provide a start date, end date, and a limit to specify exactly what candles you need.
*   If you only provide a start and end date, it will calculate the number of candles needed based on the time range.
*   You can specify an end date and a limit, and it will automatically calculate the start date.
*   If you just provide a limit, it will use the current execution context's 'when' timestamp as the start point, effectively fetching candles backwards from the present.

The function requires you to provide the trading pair symbol (like "BTCUSDT") and the desired candle interval (like "1m" for one-minute candles).


## Function getPositionWaitingMinutes

This function lets you check how long a trading signal has been waiting to be put into action. It tells you the waiting time in minutes. 

If there isn't a signal currently waiting, it will return null. 

You need to provide the symbol of the trading pair you're interested in, like "BTCUSDT".


## Function getPositionPnlPercent

This function helps you understand how your current trading positions are performing financially. It calculates the percentage profit or loss on your open positions, considering factors like partial trades, dollar-cost averaging, slippage, and fees. If there aren't any open positions to evaluate, it will return null. The function smartly figures out whether it's running a backtest or a live trade and gets the latest price information to provide an accurate assessment. You just need to provide the trading symbol, like "BTCUSDT", to get the percentage unrealized profit or loss.

## Function getPositionPnlCost

This function helps you understand how much money you've potentially gained or lost on a trade that's still in progress. It calculates the unrealized profit and loss (PNL) in dollars for a specific trading pair, considering factors like the percentage gain/loss, the initial investment cost, and even potential slippage and fees. If there’s no active trade currently being tracked, it will return null. It cleverly figures out if you're running a backtest or a live trading session and automatically retrieves the current market price to make its calculation. You only need to provide the symbol of the trading pair (like BTC/USD).

## Function getPositionPartials

getPositionPartials lets you see how your trading position has been partially closed. It gives you a list of events where you took some profit or cut a loss using functions like commitPartialProfit or commitPartialLoss. 

If there's no active trade happening, it will return null. If you've executed partial closes, it will provide an array detailing each one. 

For each partial close, you'll see the type (profit or loss), the percentage of the position closed, the price it was executed at, the cost basis at the time, and how many DCA entries were accumulated up to that point. You pass in the trading pair symbol to get the information related to that specific asset.

## Function getPositionPartialOverlap

This function helps you avoid accidentally placing multiple partial orders around the same price. It checks if the current market price falls within a defined tolerance range around previously executed partial close prices. Think of it as a safety net to prevent redundant trades – it'll return true if the price is too close to an existing partial, and false if no partials have been done yet. You can customize the tolerance range (how close is "too close") by providing a `ladder` configuration with upper and lower percentage limits. This helps keep your trading strategy clean and prevents unnecessary order executions.

## Function getPositionMaxDrawdownTimestamp

This function helps you find out exactly when a specific trading position experienced its biggest loss. It looks back at the history of that position and tells you the timestamp – a specific date and time – when the price was at its lowest point. 

If there’s no trading activity currently associated with the specified symbol, the function will return null, indicating there's nothing to analyze. 

You provide the symbol of the trading pair (like "BTCUSDT") to identify the position you're interested in.

## Function getPositionMaxDrawdownPrice

This function helps you understand the deepest loss a particular trade has experienced. It tells you the lowest price the position reached while it was open, essentially showing the maximum drawdown. 

Think of it as finding the “bottom” of a trade's performance curve.

To use it, you need to specify the trading pair symbol you’re interested in.

If there’s no active trade signal for that symbol, the function won't be able to provide a result and will return null.

## Function getPositionMaxDrawdownPnlPercentage

This function helps you understand the peak-to-trough loss experienced by a specific trade. It calculates the maximum drawdown of the profit and loss percentage for a given trading pair, essentially showing you the biggest percentage drop in profits during the position's history. 

If no trading signal is currently active for that symbol, the function will return null. 

To use it, simply provide the symbol of the trading pair you want to analyze, such as 'BTC-USDT'. The function will then return a number representing that maximum drawdown percentage.

## Function getPositionMaxDrawdownPnlCost

This function helps you understand the financial impact of a trading position's biggest loss. It calculates the profit and loss (PnL) in the currency of the traded asset that occurred when the position hit its lowest point. 

Essentially, it tells you how much money you would have lost at that point in time, relative to when you opened the trade.

If there's no active trading signal for the position, the function won't be able to provide a value and returns null.

You just need to provide the symbol of the trading pair, like 'BTC-USD', to get this information.

## Function getPositionMaxDrawdownMinutes

This function tells you how much time has passed since your position hit its lowest point. It's a way to gauge the duration of the biggest loss your position has experienced. The value will be zero the instant the lowest price is reached. If there’s no open position, the function will return null. You provide the trading pair, like "BTCUSDT", to check.

## Function getPositionLevels

This function helps you find out the prices at which your current trade was entered, particularly useful for dollar-cost averaging (DCA) strategies. It gives you a list of prices, starting with the initial price when the trade began, and then including any additional prices used when you added more to the position. If there’s no trade in progress, it will tell you with a null value. If you only made the original entry and didn't add any more, it will return an array containing just the original entry price. You need to provide the symbol (like BTCUSDT) to check the position levels.

## Function getPositionInvestedCount

This function helps you track how many times you’ve added to a trade using dollar-cost averaging (DCA). It tells you how many times the system has committed to buying more of a particular asset, starting with the initial purchase.

If the value is 1, it means only the original trade was made. Each time you successfully add to the trade using `commitAverageBuy()`, this number increases.

If there's no open trade or pending signal, the function will return null.

It automatically knows whether it's running a backtest or a live trading session. 

You provide the asset's trading symbol, like "BTC-USDT", to get the count.


## Function getPositionInvestedCost

This function helps you figure out how much money you've put into a specific trade. 

It calculates the total cost basis – essentially, the sum of all the costs associated with entering that position. 

Think of it as the total amount spent to get into the trade, considering the costs set when the trade was initially planned.

If there's no active trade being considered, it will return null.

You don't need to worry about whether you're running a test or a live trading environment; the function automatically adapts.

To use it, just provide the trading symbol (like "BTC-USD") to get the invested cost for that particular trade.

## Function getPositionHighestProfitTimestamp

This function helps you find out when a specific trade (identified by its symbol, like "BTC-USDT") reached its peak profit. 

It looks back at the trade’s history and tells you the exact timestamp – a numerical representation of the date and time – when the profit was the greatest.

If there's no trading activity recorded for that symbol, the function won't have any data and will return null.

You give it the symbol of the trading pair you're interested in, and it returns that crucial timestamp.

## Function getPositionHighestProfitPrice

getPositionHighestProfitPrice helps you find the highest price your current position has reached while potentially making a profit. 

It starts tracking this price from when the position was opened, using the entry price as the initial benchmark. As new price data comes in, it constantly updates this benchmark – going higher for long positions and lower for short positions – whenever the price moves favorably towards a potential profit target. 

You'll always get a price back as long as there’s an active trading signal; otherwise, it won’t return a value. 

The function needs the trading pair's symbol to work, like 'BTCUSDT'.


## Function getPositionHighestProfitMinutes

This function helps you understand how long a trading position has been operating below its best-ever profit level. It tells you the number of minutes that have passed since the position reached its highest profit price. 

Think of it as a measure of how far a position has fallen from its peak. If the position was just created, the value will be zero. 

To use it, you provide the trading pair symbol (like 'BTCUSDT'). The function returns a number representing the minutes passed, or null if there's no signal available.

## Function getPositionHighestProfitDistancePnlPercentage

This function helps you understand how far your position is from its best-ever profit. It calculates the difference between the highest profit percentage ever achieved for a specific trading pair and the current profit percentage. 

Essentially, it shows you how much room you still have to reach that peak profit. 

If no signals are available for the trading pair, the function won't provide a value. You just give it the symbol of the trading pair you're interested in, and it returns a number representing that distance.

## Function getPositionHighestProfitDistancePnlCost

This function helps you understand how far your current trading position is from its best possible profit. It calculates the difference between the highest profit you could have made and the profit you've actually made so far. If no trading signal is pending, it won’t be able to calculate anything and will return null. You’ll need to provide the trading pair symbol, like "BTC-USDT", to use this function.

## Function getPositionHighestProfitBreakeven

This function helps you determine if a trade could have reached a breakeven point during its most profitable moment. It essentially checks if the highest price achieved during the trade's lifetime allowed for a mathematical return to the original entry price. 

If there's no active trade signal for the specified trading pair, the function won’t have any data to analyze and will return null.

You provide the trading pair symbol (like BTCUSDT) to the function, and it will tell you whether that trade's trajectory allowed it to break even at its peak profitability.

## Function getPositionHighestPnlPercentage

This function helps you understand how well a particular trade performed. Specifically, it tells you the highest percentage profit achieved during the entire time a position was open for a given trading pair, like BTC-USDT. Think of it as finding the peak moment of gain for that trade. If there's no existing trading signal for that symbol, the function will indicate that by returning null. You need to provide the trading pair’s symbol to the function to get this information.

## Function getPositionHighestPnlCost

This function helps you understand the financial performance of a specific trading position. It tells you the profit and loss cost, expressed in the currency used for trading, at the precise point when the position reached its highest profit. 

Think of it as checking the cost associated with achieving the best possible outcome for a trade. If there's no trading signal currently associated with the position, the function will return null.

To use it, you need to provide the symbol of the trading pair you're interested in, like "BTC-USD."

## Function getPositionHighestMaxDrawdownPnlPercentage

This function helps you understand how risky a particular trading position has been. It calculates the largest percentage drop a position experienced from its peak to its lowest point, expressed as a percentage of the position's profit/loss. Think of it as a measure of how far a trade fell before potentially recovering.

The result shows you how much "cushion" a trade had before hitting its lowest point, relative to its overall performance. 

If no trades are currently active for the specified symbol, the function won't be able to calculate anything and will return null.

You provide the trading symbol (like "BTCUSDT") to specify which position's drawdown you want to analyze.


## Function getPositionHighestMaxDrawdownPnlCost

This function helps you understand how much your trading position is at risk of losing money. It calculates the difference between your current profit and loss (PnL) and the lowest point (trough) your PnL reached during a drawdown. Essentially, it tells you how far your profits have fallen relative to the worst point. If there's no trading signal currently active, the function won't be able to provide a result. You give it the symbol of the trading pair (like BTC-USD) to get a specific result.

## Function getPositionEstimateMinutes

This function helps you figure out how long a trade is expected to last. 

It tells you the estimated duration, in minutes, for a currently active trading signal. 

Think of it as a way to see how much time is left before a trade might automatically close. 

If there isn't a trade happening right now, it will return nothing. 

You just need to provide the symbol of the trading pair (like BTCUSDT) to get the estimate.

## Function getPositionEntryOverlap

This function helps you avoid accidentally placing duplicate DCA entries at similar price points. It checks if the current price you're seeing falls within a small tolerance range around any of your existing DCA entry levels.

Essentially, it’s a safety net to prevent your trading strategy from making redundant orders.

The function returns true if the current price is within the defined tolerance zone, indicating a potential overlap; otherwise, it returns false, signaling that it’s safe to proceed.

You provide the trading symbol and the current price. Optionally, you can customize the tolerance range for the check.


## Function getPositionEntries

getPositionEntries lets you see the details of how a position was built up, especially when using dollar-cost averaging (DCA). It shows a list of each buy order that contributed to the current signal.

You'll get information like the price and cost of each purchase.

If there's no active signal, it will return nothing. If you made just one purchase, you'll get a list containing just that one entry. The function needs the symbol, like 'BTCUSDT', to know which position to look at.

## Function getPositionEffectivePrice

getPositionEffectivePrice lets you find the average price at which you've acquired a position, taking into account any dollar-cost averaging (DCA) that’s been applied. It calculates this weighted average based on how much you spent and the prices at which you bought.

If you've closed parts of your position previously, the function considers those earlier prices when figuring out the current effective price. If you haven't done any DCA, the function provides the original opening price. 

It will return null if there isn't a pending signal to calculate the effective price for. The function intelligently determines whether it's running in a backtesting or live trading environment based on its surroundings.

You simply need to provide the trading symbol (like BTCUSDT) as input.

## Function getPositionDrawdownMinutes

getPositionDrawdownMinutes tells you how much time has passed since your trading position reached its highest profit point. 

Think of it as a measure of how far your profits have declined. 

It starts at zero when your position first becomes profitable, and then increases as the price moves downwards from that peak.

If there’s no open position, the function won't be able to provide a value.

You provide the trading pair, like "BTCUSDT," to specify which position's drawdown you want to check.

## Function getPositionCountdownMinutes

getPositionCountdownMinutes tells you how much time is left before a position closes, expressed in minutes. It calculates this by looking at when the position started and comparing it to an estimated closing time. 

If the estimated time has already passed, the function returns 0, meaning the position is effectively closed. 

It won't return a negative number – the countdown always starts at zero.

If no closing signal is pending, the function will return null. You'll need to provide the symbol, like 'BTCUSDT', to get the countdown for a specific trading pair.

## Function getPositionActiveMinutes

The `getPositionActiveMinutes` function helps you figure out how long a specific trading position has been open. It calculates the duration in minutes from when the position was initiated. 

If there isn't a signal currently pending for that symbol, the function will return null, indicating that it can’t determine the active time. 

You need to provide the trading pair symbol (like "BTCUSDT") as input to the function.


## Function getPendingSignal

This function lets you check if a trading strategy has a pending order waiting to be filled. 

It tells you what the current pending signal is for a specific trading pair, like "BTCUSDT."

If there isn’t a pending order, it will simply return nothing.

The function automatically knows whether it's running a test backtest or a live trading session.

You just need to provide the trading pair symbol to use it.


## Function getOrderBook

This function lets you retrieve the order book for a specific trading pair, like BTCUSDT, from the connected exchange. 
It automatically uses the current time when fetching data, which is important for accurate backtesting or live trading. 
You can specify how many levels of the order book you want to retrieve; if you don't, it will use a default depth. 
Essentially, it’s your way to get a snapshot of the current buy and sell orders for a given trading pair.

## Function getNextCandles

This function helps you retrieve future candles for a specific trading pair and time interval. It's designed to get candles that come *after* the current point in time within the backtest or simulation.

You give it the symbol of the trading pair (like BTCUSDT), the candle interval you're interested in (like 1 minute, 1 hour, etc.), and how many candles you want to fetch. The function then uses the exchange’s specific methods to grab those future candles.


## Function getMode

This function helps you figure out whether your trading strategy is running in a backtesting environment or a live trading situation. It returns a simple indicator, either "backtest" or "live", to let you know the current mode of operation. This is useful for adapting your code based on whether you're analyzing past data or actively trading.

## Function getMinutesSinceLatestSignalCreated

This function helps you figure out how much time has passed since the most recent trading signal for a specific asset. It's like a cooldown timer – useful for things like preventing very rapid trades after a stop-loss. 

It doesn't care whether the signal is still in effect or not; it simply calculates the time since it was created.

If no trading signals have been recorded for the asset, it will return null.

It automatically determines whether you're running a backtest or a live trading scenario, so you don't have to worry about that.

You just need to provide the symbol of the asset (e.g., BTCUSDT) to get the time elapsed.

## Function getMaxDrawdownDistancePnlPercentage

This function helps you understand the risk profile of a trading strategy by calculating the maximum drawdown, expressed as a percentage of the peak profit. It essentially tells you the largest drop from the highest point of profit that the strategy experienced. 

The result represents the difference between the peak profit percentage and the deepest drawdown percentage, but it will never be negative. If the backtest doesn't have any signals to analyze, the function will return null. To use it, you provide the symbol (like 'BTC-USDT') for the trading pair you're interested in.

## Function getMaxDrawdownDistancePnlCost

This function helps you understand the risk profile of a trading strategy. It calculates the largest difference between the highest profit and the lowest loss a position experienced. 

Think of it as measuring how far a trade fell from its peak before recovering. The result represents the potential loss you could have faced if you held the position through that downturn.

It takes the trading symbol (like BTC/USD) as input and returns a numerical value. If no trading signals exist, it won't return a value.


## Function getLatestSignal

This function helps you find the most recent signal generated for a specific trading pair, like BTC/USDT. 

It doesn't care if that signal led to a profitable trade or a loss – it just gives you the very last one recorded. 

You can use this to implement things like cooldown periods; for example, preventing a new trade right after a stop-loss trigger, regardless of whether the trade was a winner or loser.

The function looks for signals in your historical data first, and if it can’t find anything there, it checks your current live trading data. If no signal is found at all, it returns nothing. It automatically adjusts based on whether you’re running a backtest or live trading. You just need to provide the symbol of the trading pair.


## Function getFrameSchema

The `getFrameSchema` function lets you look up the blueprint, or schema, for a specific frame within your backtesting setup. Think of a frame as a component of your backtest, like a data feed or a strategy.  You provide the name of the frame you're interested in, and the function returns the detailed structure defining how that frame works and what data it uses. This helps you understand the inner workings of your backtest and ensures everything is set up correctly. It’s essentially a way to get the technical definition of a frame.


## Function getExchangeSchema

This function helps you find the details about a specific cryptocurrency exchange that backtest-kit understands. Think of it as looking up the blueprint for how that exchange works within the framework. You provide the name of the exchange, and it returns a description containing information like what data fields it expects and how it handles orders. This is useful for making sure your backtesting strategies are compatible with the exchange you're simulating.


## Function getDefaultConfig

This function gives you a starting point for setting up your backtests. It returns a set of default values for all sorts of settings, like how often to check prices, limits on signal generation, and maximum row counts for reports. Think of it as a cheat sheet showing you all the settings you *can* tweak and what they're set to if you don’t change anything. It's a great way to explore the configuration options before you start customizing your own settings.


## Function getDefaultColumns

This function gives you the standard set of column configurations used to build reports. Think of it as a peek at the pre-defined columns you can include. 

It returns a complete object detailing the columns for various data types like closed trades, heatmaps, live ticks, and performance metrics. 

You can use this to understand what columns exist and how they're structured before customizing your own report layouts.

## Function getDate

This function provides a way to retrieve the date relevant to your trading simulation or live trading. When running a backtest, it returns the date associated with the timeframe currently being analyzed. When deployed in a live trading environment, it gives you the current, real-time date. It's a simple tool for ensuring your calculations and logic are aligned with the correct date.

## Function getContext

This function gives you access to information about the current environment where your trading strategy is running. Think of it as a way to peek under the hood and see details about the current method being executed. It returns a special object with data relevant to the strategy's environment.

## Function getConfig

This function lets you peek at the framework's global settings. It’s like getting a snapshot of all the configurable options that control how backtests and trading strategies run. 

The returned settings cover a wide range of aspects, including things like how often the system checks for updates, how much slippage and fees are factored in, limits on data fetching, and controls for reporting and notifications. 

Importantly, this function provides a *copy* of the settings – any changes you make to the returned object won't affect the actual running configuration. It’s a safe way to examine the current setup.

## Function getColumns

This function gives you access to how your backtest results will be displayed in the report. 

It essentially provides a snapshot of the column configurations used for different aspects of the backtest, like closed trades, heatmaps, live data, and performance metrics. 

Think of it as a way to peek at what columns are being used and how they’re structured without changing the actual configuration. This can be helpful for understanding or debugging how your report looks.

## Function getClosePrice

This function helps you quickly grab the most recent closing price for a specific trading pair and time interval. It's useful for getting a snapshot of the current market conditions. You'll need to provide the symbol of the trading pair, like "BTCUSDT," and the candle interval, which could be something like "1m" for one-minute candles, "4h" for four-hour candles, or any of the other supported intervals. The function returns a promise that resolves to the closing price as a number.

## Function getCandles

This function lets you retrieve historical price data, or "candles," for a specific trading pair. You tell it which asset you're interested in (like "BTCUSDT"), how frequently the data should be grouped (like every minute or every hour), and how many candles you want to see. The function pulls this data from the exchange you're connected to and returns it to you in a structured format. It essentially gives you a way to look back and analyze past price movements.


## Function getBreakeven

This function helps you determine if a trade has become profitable enough to cover the costs associated with it. It calculates a threshold based on slippage and fees and compares the current price to that threshold. Essentially, it tells you if your trade has "broken even" considering those pesky expenses. You provide the symbol of the trading pair and the current price, and it returns true if the price has moved sufficiently in a profitable direction to cover those costs, otherwise false. This function is designed to work seamlessly in both backtesting and live trading environments.

## Function getBacktestTimeframe

This function lets you find out the specific dates used for a backtest of a particular trading pair, like BTCUSDT. It returns a list of dates that represent the timeframe being tested. You give it the symbol of the trading pair you're interested in, and it provides the corresponding dates used in the backtest. This is helpful for understanding exactly what period your backtest covers.


## Function getAveragePrice

This function helps you figure out the average price of a trading pair, like BTCUSDT. 

It calculates something called VWAP, which is a price that considers how much was traded at different prices.

Specifically, it looks at the last five minutes of trading activity to do this.

If there's no trading volume, it just uses the average closing price instead. 

You simply provide the symbol of the trading pair you’re interested in, and it returns the calculated average price.

## Function getAggregatedTrades

This function retrieves a list of aggregated trades for a specific trading pair, like BTCUSDT. It pulls this data directly from the exchange that’s been configured within the backtest-kit system. 

By default, it gets trades from a recent period, but you can specify a `limit` to request a certain number of trades, and it will fetch them in batches to ensure you get enough. If you don't provide a `limit`, it will fetch trades from a defined timeframe to make sure you’re getting a good sample.


## Function getActionSchema

This function lets you look up the definition of a specific action within your backtest setup. Think of it like checking what properties and data types are expected for a particular trading action. You provide the name of the action you’re interested in, and it returns a structured description of that action, outlining what it does and what information it needs. This is helpful for validating data or understanding how different actions are configured.

## Function formatQuantity

This function helps you display the right amount of a cryptocurrency or asset when you're placing a trade. It takes the trading pair (like BTCUSDT) and the quantity you want to trade, and then formats it to match the rules of the specific exchange you're using. This ensures the quantity is displayed correctly, including the correct number of decimal places. Think of it as making sure your order looks right to the exchange.


## Function formatPrice

This function helps you display prices correctly for different trading pairs. It takes a symbol like "BTCUSDT" and a raw price number as input. It then uses the specific rules of that exchange to format the price, ensuring the right number of decimal places are shown. Essentially, it handles the details of price formatting so you don't have to.

## Function dumpText

The `dumpText` function lets you write raw text data, like logs or reports, associated with a specific signal within your backtesting or live trading environment. Think of it as a way to save information related to a particular trading decision or event. It automatically figures out whether you're in backtest mode or live trading, and handles the signal context for you, so you don't have to worry about those details. You provide a description, a unique ID for the data, and the actual text content to be saved.


## Function dumpTable

This function helps you display data in a structured table format, perfect for visualizing results from your trading simulations. 

It takes an array of objects, which represent the rows of your table, and a few details like a bucket name, a dump ID, and a description. 

Importantly, it figures out where it is running—backtest or live—on its own, and knows which signal to use, so you don’t have to worry about those details. The table headers are automatically created based on all the different fields found in your data.


## Function dumpRecord

This function helps you save a snapshot of data, specifically a record of key-value pairs, linked to a particular "bucket" and identified by a unique ID. Think of it as creating a labeled record for later inspection or analysis. It's designed to work seamlessly within the backtest or live trading environment, automatically adjusting its behavior based on the context it's running in. The function takes a description to help you understand what the record represents. It promises to complete its task without returning a value.

## Function dumpJson

The `dumpJson` function is a handy tool for logging data during backtesting or live trading. It takes a JavaScript object and transforms it into a formatted JSON string, which is then associated with a specific signal. This is particularly useful for debugging and understanding the flow of events within your trading system. The function smartly adapts to whether you're running a backtest or a live trade, and it automatically handles resolving signals, simplifying the process of tracking and analyzing your trades. You just provide the data you want to save and a unique identifier for it.


## Function dumpError

This function lets you report error details associated with a specific signal, making it easier to track down issues during backtesting or live trading. It automatically figures out whether you're running a backtest or a live trade and handles resolving any pending or scheduled signals for you. You provide the function with information like the signal's name, a unique identifier for the dump, the actual error message, and a brief description of what happened. This helps keep error reporting organized and linked to the relevant trading signals.

## Function dumpAgentAnswer

This function helps you save and examine the complete conversation history between a bot and a user during a trading session. It takes all the messages exchanged, along with a descriptive label, and stores them in a designated location. Conveniently, it figures out whether the system is in testing or live mode, and it can even find the ongoing trading signal automatically. This makes it simple to review and analyze interactions, especially when debugging or understanding trading decisions.


## Function createSignalState

This function helps you manage the state of your trading signals in a structured way, especially when dealing with complex strategies. It creates a pair of functions – one to get the signal's current state and another to update it – and ties them to a specific "bucket" or group. 

A key benefit is that you don't have to manually specify the signal ID; the function automatically figures out whether it's running a backtest or a live trade.

This is particularly useful for strategies that track metrics across multiple trades, like how much a trade has gained or lost over time, which is common when using AI-powered trading approaches. It's designed to help track performance data over time, aiming for healthy trade results while limiting potential losses.


## Function commitTrailingTakeCost

This function lets you change the take-profit price for a trade to a specific price point. It's a shortcut that handles some of the calculations for you – it figures out how to adjust the percentage shift based on the original take-profit distance. The framework knows whether it's running a backtest or a live trading session and also gets the current price to make the adjustments accurately.

You provide the symbol of the trading pair and the desired take-profit price, and it does the rest. It returns a boolean to confirm the change was successful.


## Function commitTrailingTake

This function lets you fine-tune your take-profit levels for existing signals, specifically adjusting how far your price target trails the market.

It's important to remember that it always bases its calculations on the initial take-profit you set – not any adjustments that might have already been made. This prevents small errors from adding up and throwing off your strategy.

When you make changes, the function prioritizes being more conservative—meaning it will only move your take-profit closer to your entry price. 

For long positions, it will only lower your take-profit, while for short positions, it will only raise it. It essentially helps you to manage risk and potentially lock in profits more effectively. The function also knows whether it’s running in a backtest or a live environment without you needing to tell it.

You'll provide the symbol of the trading pair, the percentage adjustment you want to make to the original take-profit distance, and the current market price.

## Function commitTrailingStopCost

This function helps you update a trailing stop-loss order to a specific price. It simplifies the process by automatically calculating the necessary percentage shift based on the original stop-loss distance. The function works whether you're backtesting or live trading, and it automatically gets the current market price to make the adjustment. You just need to provide the trading pair's symbol and the new price you want the stop-loss to be at.

## Function commitTrailingStop

The `commitTrailingStop` function helps refine your trailing stop-loss orders. Think of it as a way to automatically nudge your stop-loss, ensuring it’s always optimizing your protection. 

It’s crucial to understand that this function works based on the *original* stop-loss distance you initially set, not any changes already made by the trailing mechanism. This prevents small errors from adding up over time.

When you adjust the stop-loss distance using `percentShift`, the function prioritizes protecting your profit – it only makes changes that result in a better protection level. It intelligently handles long and short positions, moving the stop-loss in the direction that offers the greatest safety margin.

The function automatically adapts to whether it's running in backtesting or live trading mode, streamlining its operation. The parameters are the symbol of the trading pair, the percentage change you want to apply to the original stop-loss distance, and the current market price to assess if the price is near the stop-loss.

## Function commitSignalNotify

This function lets you send out informational messages related to your trading strategy, without actually changing your positions. Think of it as a way to leave notes about what your strategy is doing – whether it's a simple decision or a more complex observation like a spike in volume. It's super convenient because it automatically pulls information like the strategy name, exchange, timeframe, and current price, saving you from having to manually provide them. You can use it to trigger alerts or simply keep a detailed log of your strategy's actions. The messages are categorized as `signal.info`, meaning they're designed to be informative rather than warnings or errors.


## Function commitPartialProfitCost

The `commitPartialProfitCost` function lets you automatically close a portion of your trade when you've reached a specific profit target measured in dollars. It simplifies the process by handling the conversion from a dollar amount to a percentage of your initial investment. 

Essentially, it's designed to help you lock in profits gradually as your trade moves toward its take-profit level. The function cleverly figures out whether you're running a backtest or a live trade and retrieves the current market price for you. 

You provide the symbol of the trading pair and the dollar amount you want to close, and it takes care of the rest, moving your position closer to your take profit target.

## Function commitPartialProfit

This function lets you automatically close a portion of your open trade when the price moves favorably, essentially moving you closer to your target profit. It’s designed to help secure profits along the way. You specify the trading symbol and the percentage of the trade you want to close, like 25% or 50%. The system will figure out if it’s running a backtest or a live trade, so you don't have to worry about that. Remember, it only works when the price is trending in the direction of your profit target.


## Function commitPartialLossCost

This function lets you partially close a position to limit losses, specifying the exact dollar amount you want to recover. It's designed to automatically adjust that dollar amount to a percentage of your original investment, making it simpler to manage. The system ensures the price is trending in a way that aligns with your stop-loss strategy. It also handles whether it's running in a backtesting or live trading environment and automatically gets the current price for accurate calculations. You provide the symbol of the trading pair and the dollar amount you want to recover from the position.


## Function commitPartialLoss

This function allows you to automatically close a portion of your open trading position when the price moves unfavorably, essentially moving towards your stop-loss level. You specify the trading symbol and the percentage of your position you want to close. 

It's designed to work seamlessly whether you're backtesting strategies or trading live, handling the mode automatically. This is helpful for managing risk and potentially reducing losses on a trade. Remember, the price must be moving in a direction that would trigger a stop-loss for the partial close to execute.


## Function commitClosePending

This function lets you cancel a pending trade signal without interrupting your strategy’s operation. Think of it as a way to manually dismiss a 'hold' signal on a trade. It won't affect any future signals your strategy might produce or any signals already scheduled. It essentially clears the pending order, allowing your strategy to continue as normal. You can optionally add a note or ID to the cancellation for record-keeping purposes. The system automatically knows whether it's running in a backtest or live environment.

## Function commitCancelScheduled

This function lets you cancel a previously scheduled signal for a trade, but it won't interrupt your trading strategy. Think of it as a way to retract a plan without pausing or altering the overall trading process. It specifically clears a signal that's waiting for the price to reach a certain level (priceOpen activation). Importantly, this action doesn't affect any existing orders or stop the strategy from producing new signals. The function intelligently figures out if it's running in a test or live environment.

You can optionally include extra information, like an ID or a note, with the cancellation if you want to keep a record.

## Function commitBreakeven

This function helps manage your trades by automatically adjusting the stop-loss order. It moves the stop-loss to the entry price – essentially making the trade risk-free – once the price has moved favorably enough to cover any transaction costs and a small slippage buffer.

Think of it as a safety net that kicks in when a trade is performing well.

It works automatically in both backtesting and live trading environments and takes care of getting the current price for you. You just need to specify the trading pair symbol you're working with.

## Function commitAverageBuy

The `commitAverageBuy` function helps you add to a position using dollar-cost averaging (DCA). It essentially records a new purchase at the current market price, building up your position over time. This function updates the average price you paid for the asset and lets other parts of your backtest know a new buy order was executed. It figures out whether it's running a test or a live trading scenario and automatically gets the current price for the trade. You provide the symbol of the asset you're trading, and optionally a cost parameter.

## Function commitActivateScheduled

This function lets you manually trigger a scheduled trading signal before the price actually hits the expected level. Think of it as giving a signal a little nudge to activate sooner than planned. 

It essentially sets a flag that the system checks during its regular price updates. The actual trade will then execute on the next price tick. 

The function handles whether it's running a backtest or a live trade automatically.

You can also add optional notes or IDs to the signal’s record when activating it early, providing helpful context for future analysis. 

It requires the symbol (like "BTCUSDT") to identify the trading pair.


## Function checkCandles

The `checkCandles` function is your tool for quickly verifying if your historical candlestick data is already available and stored. It leverages the persistence adapter to efficiently see if the data exists without having to load everything. This function is particularly useful to prevent unnecessary data downloads by first checking if the required candles are already present. It performs a targeted check across the adapter, making it a quick and resource-friendly way to confirm data availability. The `params` object holds the details needed for the validation process.

## Function cacheCandles

This function is designed to make sure your trading data (specifically, historical price candles) are stored and readily available for backtesting. It checks if the needed data already exists, and if not, downloads it from the exchange and then verifies it again to guarantee accuracy. Think of it as a robust way to populate your data store before you begin running simulations – it first validates, then fills in any gaps, and re-validates to be absolutely certain. You provide details like the trading symbol, time interval (e.g., 1 minute, 1 day), the start and end dates, the exchange where the data originates, and optional callbacks to monitor the start of checks and warm starts.

## Function addWalkerSchema

This function lets you register a strategy walker, which is crucial for comparing the performance of different trading strategies. Think of it as setting up a system to run multiple backtests simultaneously on the same data.

The walker uses a configuration object, which you provide, to define how these backtests are executed and how the results are compared. It's like giving instructions to the framework on how to evaluate your strategies against each other.


## Function addStrategySchema

This function lets you tell the backtest-kit about a new trading strategy you want to use. 

It's like registering your strategy so the system knows how it works.

When you register a strategy, the framework will automatically check it to make sure it’s set up correctly—things like verifying the price data, stop-loss/take-profit settings, and timestamps are valid. 

It also helps prevent issues like too many signals being generated and ensures that your strategy's data can be saved even if there are unexpected problems.

You provide the function with a configuration object that describes your strategy.


## Function addSizingSchema

This function lets you tell the backtest kit how to determine the size of your trades. It's how you define your risk management strategy.

You provide a sizing schema, which is a set of rules that dictate things like how much of your capital to risk on each trade, whether you're using a percentage-based approach, or something more complex.

The schema includes details about the method used for sizing, risk parameters, limits on position sizes, and even a way to react to events during the sizing calculation. Essentially, it's the blueprint for how your positions are sized.


## Function addRiskSchema

This function lets you set up how your trading system manages risk. It's like creating a blueprint for keeping your portfolio safe. 

You can specify limits on how many different trades can be open at once. It also allows for custom checks to ensure your trading aligns with more complex risk rules, like monitoring portfolio health or checking relationships between different assets. 

Finally, it lets you define what happens when a trading signal is flagged as risky – whether it's rejected, modified, or allowed. Because several trading strategies can use the same risk settings, it enables the system to see how your strategies interact and affect overall risk.

## Function addFrameSchema

This function lets you tell the backtest-kit about a new timeframe generator you want to use. Think of it as registering a way to create the historical data that your trading strategies will operate on. You define how the data is organized – specifying the start and end dates for your backtest, the interval (like daily, hourly, or minute data), and how to handle events during the timeframe creation. Essentially, it's how you teach the system how to build the data sequences you'll be testing your strategies against.

It takes a single object, `frameSchema`, which holds all the details of this timeframe generator.


## Function addExchangeSchema

This function lets you integrate a new exchange into the backtest-kit framework. Think of it as telling the system where to get historical price data and how to interpret it. It's how you connect the framework to the specific exchange you want to backtest strategies against.

You provide a configuration object that defines how to access the exchange's data, including how to retrieve past candle data, format prices and quantities, and calculate the VWAP (Volume Weighted Average Price) indicator. This allows the backtest-kit to understand and use the data from your chosen exchange.


## Function addActionSchema

This function lets you tell the backtest-kit framework about a new action you want it to perform during a backtest. Think of actions as little automated tasks that get triggered by specific events happening in your trading strategy – like when a trade is opened, closed, or hits a profit target.

You can use these actions to do things like update a state management library (like Redux), send notifications to a messaging service (like Discord or Telegram), log events, or track performance metrics.

Essentially, you're defining *what* should happen when certain events occur, and registering that plan with the framework.  The action happens within each loop of your strategy, receiving information about what’s going on. You define the action's configuration, which tells the framework how and when to run it.

