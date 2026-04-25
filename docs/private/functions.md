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

The `writeMemory` function lets you store data related to a specific trading signal. Think of it like saving a note associated with a particular event or decision in your trading process. You provide a name for the storage bucket, a unique ID for the memory slot, the actual data you want to store (which can be any object), and a description to remind yourself what the data represents. This function intelligently adapts to whether you’re running a test backtest or a live trading scenario. It handles finding the correct signal automatically, so you don't have to worry about those details.

## Function warmCandles

This function helps speed up backtesting by pre-loading historical candlestick data. It downloads candles—those price charts you see—for a specific time period, starting from a `from` date and going up to a `to` date. This data is then saved for quicker access during backtests, preventing the need to repeatedly download it. Essentially, it's a way to warm up the system with data before you start running simulations. You provide it with the date range you want to cache, and it handles the rest.

## Function validate

This function helps ensure everything is set up correctly before you start any backtests or optimizations. It checks that all the entities you’re using—like exchanges, strategies, and risk models—actually exist and are registered within the system. 

You can tell it to validate specific entities, or if you leave it blank, it will check *everything*. It remembers the results of previous validations to make the process faster. Think of it as a quick health check for your trading setup.


## Function stopStrategy

This function lets you halt a trading strategy's signal generation. 

It essentially pauses the strategy, preventing it from creating any new trades. 

Any existing trades will still finish normally.

The system will automatically stop at a suitable point, whether it's in backtesting or live trading mode.

You just need to provide the trading symbol (like "BTCUSDT") to specify which strategy to stop.


## Function shutdown

This function provides a way to cleanly stop the backtesting process. It sends out a signal that lets different parts of the system know it's time to wrap things up, like saving data or closing connections. Think of it as a polite way to say goodbye before the program ends, ensuring no important steps are missed. It's useful when you need to stop the backtest, like when you press Ctrl+C.

## Function setSignalState

This function lets you update a specific value, like a trading metric, and associate it with an active signal. It’s designed to work smoothly in both backtesting and live trading environments, automatically adjusting to the current mode.

The function looks for an active, pending signal and if it finds one, it uses it to update the value. If no such signal exists, it will alert you with a warning, but won't actually change anything.

It's particularly useful for strategies that track how trades are performing over time, such as those that build up details like the highest percentage gain or how long a trade remains open. The examples highlight using it to track performance and potentially manage trades based on specific conditions like duration and percentage gain. You'll pass in the value to update and a description of the 'bucket' – the specific signal it’s linked to.


## Function setSessionData

The `setSessionData` function lets you store information that’s relevant to a specific trading setup—like a particular symbol, strategy, exchange, and timeframe. This data sticks around even as new candles come in, or if your program unexpectedly restarts while running live. It's perfect for keeping track of things like calculations from AI models or intermediate calculations that need to be remembered between candles. You can clear the stored data by setting the value to `null`. The function automatically knows whether it's running a backtest or live trading session.

You provide the symbol you're working with and the value you want to store; it could be an object containing various pieces of data.


## Function setLogger

You can now control where and how the backtest-kit framework’s internal messages appear. This function lets you provide your own logging system. It takes a logger that follows a specific interface, and any logging information generated by the framework will be sent through your logger, along with helpful details like the strategy name, exchange, and trading symbol. This makes debugging and monitoring your backtesting process much easier and more informative.

## Function setConfig

This function lets you customize how the backtest-kit framework operates. You can adjust settings like data fetching or trade execution by providing a configuration object. 

Think of it as tweaking the underlying machinery to suit your specific needs.

The `config` parameter allows you to selectively change certain settings; you don’t need to redefine everything.

For advanced testing scenarios where you need to bypass certain safety checks, the `_unsafe` flag allows you to do that—but use it cautiously!

## Function setColumns

This function lets you customize the columns that appear in your backtest reports, such as those generated in markdown format. You can adjust the way data is displayed by providing your own column configurations, effectively overriding the default settings. The framework checks your configurations to make sure they are structurally sound, but there's a special flag to bypass this validation if you're using it in a test environment.

## Function searchMemory

The `searchMemory` function helps you find relevant information stored in memory based on a search query. It uses a technique called BM25 to rank the memory entries, ensuring the most relevant results appear first. 

This function is designed to work across different environments – whether you're running a backtest or a live trading system – and it cleverly determines the appropriate mode based on the current context. It even figures out which signal is currently active, simplifying your workflow.

You provide a bucket name (where the memory is stored) and a search query, and the function returns a list of matching memory entries, along with a score indicating their relevance and the actual content of each entry.


## Function runInMockContext

This function lets you execute code as if it were running within a backtest-kit environment, but without actually needing a full backtest setup. Think of it as creating a miniature, controlled testing ground for your code.

It's particularly handy when you need to use functions that rely on the backtest context, like getting the current timeframe, but don't want to run a complete backtest.

You can customize this mock environment by providing details like the exchange name, strategy name, symbol, and whether you're in backtest or live mode. If you don't provide these details, it will use some default, simple values.


## Function removeMemory

This function helps clean up your backtest data. It's used to delete a specific memory entry that's associated with a signal. Think of it as removing a temporary record to keep things tidy.

It handles the details of knowing whether you're running a backtest or a live trading session and will also resolve any related pending or scheduled signals automatically.

You just need to provide the name of the data bucket and the unique ID of the memory entry you want to remove.


## Function readMemory

The `readMemory` function lets you retrieve stored data from memory, associating it with the current trading signal. Think of it as fetching a previously saved piece of information needed for your strategy. It automatically figures out whether you’re running a backtest or a live trade and determines the relevant signal to use.

You provide a simple object containing the bucket name and the memory ID – these act as identifiers for the specific data you want to access.  The function returns a promise that resolves with the data itself, typed to match the structure of what you stored.

## Function overrideWalkerSchema

This function lets you adjust the way your backtest strategies are compared. Think of it as tweaking a comparison blueprint – you can modify specific aspects of how the comparison is done, but you're not creating a brand new blueprint from scratch. It takes a partial set of instructions for the comparison, applying only those instructions to the existing comparison setup. This is helpful when you want to refine the comparison process without completely redefining it.

## Function overrideStrategySchema

This function lets you modify a trading strategy that’s already set up within the backtest-kit framework. Think of it as fine-tuning an existing strategy—you can change specific aspects, like parameters or configuration details, without having to rebuild the entire strategy from scratch. It's designed to be a targeted update, only changing the parts you specify, leaving everything else untouched. You provide a partial configuration object, and it merges that with the existing strategy definition.

## Function overrideSizingSchema

This function lets you adjust a position sizing strategy that's already been set up within the backtest-kit. Think of it as making small tweaks to an existing plan instead of creating a brand new one. You provide a partial sizing schema, which means you only specify the settings you want to change. The rest of the original sizing configuration stays exactly as it was. This is useful for making on-the-fly adjustments to how your positions are sized during a backtest.

## Function overrideRiskSchema

This function lets you tweak existing risk management setups within the backtest-kit framework. Think of it as a way to fine-tune a risk profile without completely rebuilding it. You provide a set of changes—just the pieces you want to adjust—and this function updates the existing risk configuration, leaving everything else untouched. It's helpful for making incremental adjustments to how your trading strategies manage risk.


## Function overrideFrameSchema

This function lets you tweak how your data is organized for backtesting, specifically for a particular timeframe. Think of it as modifying an existing blueprint for how your data is structured. It’s useful if you need to change just a few details of a timeframe’s configuration without redefining everything from scratch. Only the settings you provide will be altered; everything else stays as it was. You provide a partial configuration, and it merges with the existing one.

## Function overrideExchangeSchema

This function lets you modify an existing exchange's data source within the backtest-kit framework. Think of it as making targeted changes – it won’t replace the entire exchange definition, but rather updates specific parts you provide.

You give it a chunk of the exchange configuration you want to change, and it returns a modified version of the exchange schema. This is useful if you need to tweak settings or adjust data without starting from scratch. It's designed for making incremental adjustments to how your exchange data is handled.

## Function overrideActionSchema

This function lets you tweak existing action handlers without completely replacing them. Think of it as a targeted update – you specify what needs changing, and the rest of the handler’s configuration stays the same. It’s really helpful when you want to adjust how your system responds to certain events, maybe to modify callback functions for different environments or even swap out handler implementations on the fly, all without having to redo your core strategy. You can essentially fine-tune the behavior of your actions without altering the overall strategy itself. The configuration object you provide will only update the fields you specify.

## Function listenWalkerProgress

This function lets you keep track of how a backtest is progressing. It allows you to listen for updates after each strategy finishes running within a backtest. 

Think of it as setting up a listener that gets notified as the backtest moves through its steps. Importantly, the updates are handled one at a time, even if your notification process takes some time. This prevents things from getting out of order or becoming overloaded. You provide a function that will be called with information about each progress event. The function you provide will also return a function that you can call to unsubscribe from receiving updates.

## Function listenWalkerOnce

`listenWalkerOnce` lets you react to specific events happening during a trading backtest, but only once. Think of it as setting up a temporary listener that waits for a particular condition to be met, then runs your code and disappears. You provide a filter that defines what kind of event you're interested in, and a function that will execute when that event occurs. After that single execution, the listener automatically stops listening. It's handy for things like waiting for a specific trade to execute or a certain market condition to arise.


## Function listenWalkerComplete

This function allows you to be notified when a backtest run finishes, specifically when all strategies have been tested. It's like setting up a listener that gets triggered when the backtest is complete. Importantly, the notifications happen one at a time, ensuring that any processing you do in response to the notification doesn't interfere with other operations. You provide a function that will be called when the backtest is done, and the function you provide will return another function that you can call to unsubscribe.


## Function listenWalker

The `listenWalker` function lets you track the progress of a backtest as it runs. It’s like setting up an observer that gets notified when each strategy finishes executing within the backtest.

You provide a function that will be called for each strategy's completion. This function receives information about the finished strategy.

Importantly, the updates are handled in a specific order, and any asynchronous operations within your provided function won’t disrupt the sequence of updates, ensuring a consistent flow of information. The function will return an unsubscribe method to stop listening to walker progress events.

## Function listenValidation

This function lets you keep an eye on any problems that pop up during risk validation – that’s when your system is checking if a trading signal is safe to act on.

Think of it as setting up a notification system; whenever a validation check fails and throws an error, this function will call back to your provided function.

It's great for spotting and fixing issues in your validation processes.

Importantly, the errors are handled one at a time, in the order they happen, even if your notification function needs to do some asynchronous work. This ensures things are processed cleanly and safely.

You provide a function that will be called with the error details whenever a validation error occurs, and this function returns another function which can be called to unsubscribe.

## Function listenSyncOnce

This function lets you listen for specific signals and react to them, but only once. It’s handy when you need to coordinate with systems outside of the backtest, ensuring things happen in the right order. 

You provide a filter to determine which signals you’re interested in, and a function to execute when a matching signal arrives.  

Importantly, if your function takes a bit of time to complete (like if it involves a promise), the backtest will pause until it's done.  This makes sure everything lines up correctly. There's also a 'warned' parameter you can use for more control over the process. The function returns a way to unsubscribe from listening.

## Function listenSync

This function lets you listen for events related to signal synchronization, like when a signal is about to be opened or closed, but with a twist. It's designed to help you coordinate your trading activities with external systems or processes that might take some time to complete.

If you provide a callback function that returns a promise, the backtest kit will actually pause the opening or closing of positions until that promise resolves.  This is really handy when you need to ensure something external finishes before the trade happens.

Essentially, you're getting notified about synchronization events and having the ability to control the timing of trades to align with external dependencies.


## Function listenStrategyCommitOnce

This function lets you set up a listener that reacts to changes in your trading strategy, but only once. You provide a filter to specify which changes you're interested in, and a function to execute when that specific change happens. After the callback runs, the listener automatically stops listening, making it perfect for scenarios where you need to respond to a single event and then move on. Think of it like waiting for a specific signal before taking an action, then forgetting about the signal once the action is complete.

## Function listenStrategyCommit

This function lets you keep an eye on what's happening with your trading strategies. It’s like setting up a notification system that tells you when things change, such as when a scheduled trade is canceled, a pending order is closed, or when stop-loss and take-profit levels are adjusted. The notifications happen one after another, even if the function you provide to handle them takes some time to run. This helps ensure changes are processed correctly and prevents any conflicts. You give it a function that will be called whenever one of these events occurs, and it will keep you informed about your strategy's actions.


## Function listenSignalOnce

This function lets you listen for specific trading signals and react to them just once. You tell it what kind of signal you're looking for using a filter – a function that checks each signal event. Once a signal matches your filter, the provided callback function runs, and then the subscription automatically stops. It's handy for situations where you need to respond to a particular market condition only one time.

Essentially, it's a one-time signal listener.


## Function listenSignalNotifyOnce

This function lets you react to specific signal events, but only once. 

It takes a filter – essentially a rule – to determine which events you’re interested in. 

Then, it provides a callback function that will run *just one time* when an event matches your filter. 

After that single execution, the function automatically stops listening, so you don’t have to manage the subscription yourself. 

It returns a function that you can call to unsubscribe manually if needed.


## Function listenSignalNotify

This function lets you be notified when a trading strategy sends out a signal note related to an open position. Think of it as a way to "listen" for specific messages from your strategy.

When a strategy uses `commitSignalInfo()` to share this information, you’ll receive a notification through the function you provide.

These notifications are handled in a specific order, and if your callback function takes some time to process (like an asynchronous operation), the framework ensures that it completes before the next notification is sent, keeping things in sync. 

To use it, you simply give it a function that will be called whenever a signal note is available. The function you provide will get information about the event. When you are done listening, the returned function unsubscribes the listener.

## Function listenSignalLiveOnce

This function lets you temporarily listen for specific signals coming from a live trading simulation. It's designed for situations where you need to react to a signal just once and then stop listening.

You provide a filter – a test that determines which signals you're interested in – and a function that gets called when a matching signal arrives. The function will execute only once and then automatically unsubscribe you from the signal stream, so you don't have to manage that manually. This is helpful for things like capturing a single data point or performing a one-off action based on a signal.


## Function listenSignalLive

This function lets you listen for live trading signals as they come in from a running backtest. It’s like setting up an ear to the system while it's actively trading.

Whenever a new signal event happens, it will be passed to the function you provide. Importantly, these signals are processed one at a time, in the order they're received, ensuring that events are handled consistently.

You only receive signals generated during an active `Live.run()` execution. To stop listening, the function returns another function that you can call to unsubscribe.

## Function listenSignalBacktestOnce

This function lets you temporarily tap into the stream of events generated during a backtest to react to specific situations. Think of it as setting up a brief listener that only cares about certain signals.

It's designed for one-time use – you provide a filter to decide which events you want to see, and a function to handle them. Once the filter matches and the callback runs, the listener automatically goes away, preventing unwanted ongoing processing. This is particularly useful for debugging or quickly grabbing specific data points during a backtest. 

You’ll get events directly from the `Backtest.run()` execution.


## Function listenSignalBacktest

The `listenSignalBacktest` function lets you tap into the flow of information during a backtest. It’s like setting up a listener that gets notified whenever a signal event happens.

You provide a function (`fn`) that will be called with the details of each event. Think of it as giving it a little routine to execute whenever something interesting happens during the backtest.

Importantly, this listener only receives signals generated during a `Backtest.run()` execution. The events will also be handled one after another, ensuring the order is preserved. This allows for reliable, sequential processing of backtest signals. The function returns a function that, when called, unsubscribes the listener.


## Function listenSignal

This function lets you listen for events related to your trading strategies, like when a position is opened, active, or closed. It ensures these events are handled one at a time, even if your processing takes a little longer. Essentially, you provide a function that will be called whenever a signal event occurs, and this function will handle the event in a reliable, sequential manner. It's a straightforward way to keep track of what’s happening with your strategies.

## Function listenSchedulePingOnce

This function helps you react to specific ping events that meet a certain condition, but only once. Think of it as setting up a temporary listener that executes your code just once when the right event appears. After that single execution, the listener automatically disappears, so you don't need to worry about cleaning it up. 

You provide a filter that describes the kind of event you're looking for, and a function to run when that event is found.


## Function listenSchedulePing

This function lets you listen for periodic "ping" signals while a scheduled signal is being monitored – that's when the system is waiting for it to become active. Think of it as a heartbeat to confirm the monitoring is still running. 

You provide a function that will be called every minute with information about the ping event. This allows you to build custom logic to track the status of the scheduled signal and handle any special monitoring needs. It's a way to keep an eye on things while waiting for a scheduled signal to kick in.


## Function listenRiskOnce

This function lets you react to specific risk rejection events, but only once. 

You provide a filter – a test to determine which events you’re interested in – and a function to execute when a matching event occurs. 

Once that event is found and processed, the listener automatically stops, preventing further unnecessary executions. It's handy when you need to wait for a particular risk condition to be met and then take action. 

The function returns an unsubscribe function that you can use to manually stop the listener if needed.

## Function listenRisk

This function allows you to monitor for situations where a trading signal is blocked because it violates pre-defined risk rules. 

It's designed to only notify you when a signal is rejected, so you won’t be bombarded with updates for every signal that passes. 

The updates are delivered in the order they occur, and the system ensures that your callback function is executed one at a time, even if it involves asynchronous operations, guaranteeing a smooth and predictable workflow. You provide a function that will be called whenever a risk check fails, receiving information about the rejected signal.


## Function listenPerformance

The `listenPerformance` function lets you monitor how long different parts of your trading strategy are taking to execute. It's a way to profile your code and find areas that might be slowing things down. Whenever your strategy runs, this function will send you updates about the time it takes for specific operations. These updates are handled one at a time, even if the code you provide to process them takes some time itself, ensuring a controlled flow of information. You provide a function that will be called with the performance data, and this function returns another function that you can use to unsubscribe from these performance updates.

## Function listenPartialProfitAvailableOnce

This function lets you watch for a specific type of profit event – one where a partial profit level has been reached – and react to it just once. You provide a rule (a `filterFn`) to identify the exact profit event you're interested in. Once that event happens, the provided `fn` will run, and the function automatically stops listening. It's a handy way to trigger an action only when a particular profit target is hit.

## Function listenPartialProfitAvailable

This function lets you keep track of when your backtest reaches certain profit milestones, like 10%, 20%, or 30% gains. It’s like setting up a listener that gets notified at these key points during your backtest. Importantly, these notifications are handled one at a time to avoid any conflicts, ensuring that the events are processed in the order they occurred even if your notification handling code takes some time. To use it, you provide a function that will be executed when one of those profit milestones is reached, and it will return a function to unsubscribe from those notifications later.

## Function listenPartialLossAvailableOnce

This function lets you set up a one-time alert for a specific type of loss event in your trading system. You provide a filter – a set of conditions – and a function to run when that specific event occurs. Once the event happens and your function runs, the alert automatically goes away, so you won't be bothered by it again. It's perfect for reacting to a particular loss situation just once, like triggering a manual review or adjusting risk parameters.

The `filterFn` defines what kind of loss events you're interested in. The `fn` is the code that will execute when an event matches your filter.


## Function listenPartialLossAvailable

The `listenPartialLossAvailable` function lets you keep track of how much a trading strategy has lost along the way. It's like setting up a notification system that tells you when the losses reach certain milestones, like 10%, 20%, or 30% of the initial amount. 

Whenever one of these milestones is hit, the function will call a piece of code you provide – this is your callback function. This function receives information about the current loss level.

Importantly, the system makes sure these notifications are processed one at a time, even if your callback function takes some time to complete. This helps prevent unexpected issues from multiple notifications happening simultaneously. You can unsubscribe from these events by returning the function from `listenPartialLossAvailable`.

## Function listenMaxDrawdownOnce

This function lets you set up a one-time alert for when a specific max drawdown event happens. You provide a filter – think of it as a condition – and a function to run *only once* when that condition is met. Once the condition is triggered, the alert automatically goes away, so you won't get any more notifications. This is ideal if you’re waiting for a particular drawdown level to occur and then need to react immediately.

It takes two pieces of information: first, a way to define what kind of drawdown events you're interested in, and second, what you want to do when that specific event occurs. The function handles the subscription and unsubscription automatically.


## Function listenMaxDrawdown

This function lets you keep an eye on how much your trading strategy has lost from its peak value. It's like setting up a notification system that alerts you whenever the maximum drawdown changes. 

It works by queuing up these notifications and processing them one at a time, so you don't have to worry about things getting out of order or overwhelming your system. You provide a function that gets called whenever a new maximum drawdown is detected, and this function can handle the event. 

This is a helpful tool for understanding the potential risks of your strategy and adjusting your approach as needed.


## Function listenIdlePingOnce

This function lets you react to periods of inactivity within your application, but it only triggers once for the first matching event it finds. It's useful when you need to perform a specific action, like saving state or triggering a refresh, only when the application is initially idle.

You provide a condition (`filterFn`) to determine which idle ping events should trigger the action, and then a function (`fn`) that will be executed when a matching event occurs. Once that first event has been processed, the subscription automatically stops.


## Function listenIdlePing

This function lets you listen for moments when the backtest-kit isn’t actively processing anything – essentially, a period of inactivity. 

It calls your provided function whenever this idle state occurs. 

The function you provide will receive an `IdlePingContract` object, which contains information about the idle ping event.

Importantly, this event is triggered *every* tick when no signals are being watched.

To stop listening, the function returns a function that you can call to unsubscribe.


## Function listenHighestProfitOnce

This function lets you set up a listener that reacts to specific highest profit events. You tell it what kind of events you’re interested in using a filter – essentially, rules it needs to meet. Once an event matches your filter, the provided function will be executed just once, and then the listener automatically stops. It's a convenient way to react to a single occurrence of a particular profit scenario.

You define the filter by providing a function that checks each event.  The function you provide as the second argument will then be called only when an event passes through your filter.


## Function listenHighestProfit

This function lets you monitor when a trading strategy reaches a new peak profit during its backtest. It's like setting up a listener that gets notified whenever the strategy's profit improves. 

The events are handled one at a time, even if your notification code takes a little while to run. This ensures things stay organized and prevents potential issues from multiple callbacks happening simultaneously.

You can use this to keep track of your strategy's profit milestones or to trigger actions based on those milestones. To start listening, you simply provide a function that will be called whenever a new highest profit is achieved. The function you give it will receive details about the event that triggered the notification. When you’re done listening, the function will return another function which can be called to stop the listener.

## Function listenExit

This function lets you monitor for serious, unrecoverable errors that might abruptly stop your backtesting or live trading processes. 

Think of it as a safety net for those critical situations. 

It specifically listens for errors that halt execution of background tasks, like those used for Live, Backtest, or Walker environments.

It's different from error handling that allows recovery; these errors are meant to signal a stop. 

The errors are handled one at a time, in the order they happen, even if your error handling function takes some time to complete. A wrapper ensures that your error handling doesn't run simultaneously, preventing potential conflicts.


## Function listenError

This function lets you set up a listener that will be notified whenever your trading strategy encounters a recoverable error – think of it as a safety net for situations like a temporary API problem. Instead of stopping everything, the strategy will continue running, and this listener will give you a chance to deal with the error in a controlled way. The errors will be handled one at a time, in the order they happened, so you can be sure things are processed properly even if the error handling itself takes some time. To use it, you provide a function that will be called whenever an error occurs, allowing you to log it, retry the operation, or otherwise manage the situation. When you're done listening, you can unsubscribe from the error stream.

## Function listenDoneWalkerOnce

This function lets you react to when a background process finishes, but only once. It allows you to specify a condition – a filter – to determine which completed processes you're interested in. Once a matching process completes, your provided callback function will be executed, and the subscription will automatically be removed, preventing further calls. It’s helpful for handling specific, one-off events related to background tasks.

## Function listenDoneWalker

This function lets you listen for when background tasks within a walker finish running. 

Essentially, it's a way to know when a long-running process connected to a walker has completed.

The provided callback function will be executed when the background task is done.

Importantly, even if your callback involves asynchronous operations, the events are handled one after another in the order they come, ensuring things proceed sequentially and preventing unexpected issues from running callbacks simultaneously.


## Function listenDoneLiveOnce

This function lets you react to when a background task finishes running within your backtest. It's useful for responding to specific events that happen during the backtest process. You provide a filter function to narrow down which completion events you care about, and a callback function that will be executed just once when a matching event occurs. Once the callback runs, the listener automatically stops listening, so you don't need to worry about manual cleanup.

## Function listenDoneLive

This function lets you keep an eye on when background tasks run by Live finish up. It's like setting up a notification system for completed background processes. 

When a background task is done, this function will call the function you provide. It ensures these notifications happen one at a time, even if the callback you provide takes some time to run. This helps prevent unexpected issues that can arise from things happening simultaneously. You get a `DoneContract` object with details about the completed task whenever a background process finishes.


## Function listenDoneBacktestOnce

This function lets you react to when a background backtest finishes, but only once. You provide a filter to specify which backtests you're interested in, and then a function that gets executed when a matching backtest completes. The function automatically stops listening after it’s run once, so you don’t have to worry about managing subscriptions yourself. Think of it as a one-time notification when something specific happens during a backtest.


## Function listenDoneBacktest

This function lets you be notified when a background backtest finishes running. 

Think of it as setting up a listener that gets triggered when the backtest is done. 

It’s designed to handle events one at a time, even if the notification you receive involves some asynchronous processing, so things don’t get jumbled up. You provide a function that will be called with details about the finished backtest. This function will return a function that you can call to unsubscribe from the listener.

## Function listenBreakevenAvailableOnce

This function lets you set up a listener that reacts to changes in breakeven protection, but only once. It allows you to specify a condition – a filter – to determine which changes you’re interested in. Once that condition is met, the provided function is executed, and the listener automatically stops, preventing further callbacks. It’s a great way to react to a particular breakeven condition and then forget about it.

You provide a function that checks the breakeven details to see if it matches your desired condition. 
Then you provide the function that gets executed when that condition is met. 
The listener only triggers once and then stops listening.


## Function listenBreakevenAvailable

This function lets you monitor when a trade's stop-loss automatically adjusts to the original entry price – essentially, the trade becomes protected from losses. 

It's designed to handle situations where the price moves favorably, enough to cover the costs of the trade, and the stop-loss is then moved to breakeven.

Events are delivered one at a time, even if your callback function takes some time to run, preventing any unexpected behavior from multiple simultaneous executions.

To use it, you provide a function that will be called whenever a breakeven event occurs, and it returns a function that can unsubscribe from the events.


## Function listenBacktestProgress

This function lets you keep an eye on how a backtest is running. It sets up a listener that gets notified as the backtest progresses, providing updates along the way. 

These updates are sent during the background processing of the backtest, so you can track its advancement. Importantly, the updates are handled one at a time, even if the code you provide to handle them takes some time to complete. This ensures that the progress information is processed in the order it arrives, and avoids any potential issues with running things concurrently. You'll provide a function that gets called with each progress update; this function is used to process the information being provided. The function will return a cleanup function that you can use to unsubscribe when you no longer need to listen.

## Function listenActivePingOnce

This function lets you react to specific active ping events, but only once. You tell it what kind of event you're looking for, and it will watch for that. When it finds a matching event, it runs your provided function once to handle it, and then it stops listening. This is really handy if you need to wait for a particular condition to be met and then take action.

It takes two things: a filter – which defines the events you want – and a function – what you want to do when you find a matching event. When the function is done executing, the subscription is automatically stopped.

## Function listenActivePing

This function lets you keep an eye on active trading signals. It's like setting up a listener that gets notified every minute about the status of signals that are currently running. 

You can use this to understand how your signals are progressing and to build logic that reacts to changes in their activity – maybe adjust strategies or manage resources.

The function gives you a callback that's called when a new ping event arrives. Importantly, it handles things in a safe way: even if your callback takes some time to process, the events will be processed one after another, and it won’t run multiple callbacks at the same time. 

You provide a function that tells it what to do when a ping event occurs. This subscription can be stopped by returning the function that's returned by `listenActivePing`.

## Function listWalkerSchema

This function helps you discover all the different trading strategies (walkers) that have been set up within the backtest-kit system. It essentially gives you a list of all the available strategies you can use. This is particularly handy if you're trying to understand how the system is configured, troubleshoot issues, or create a user interface that displays the strategies. Think of it as a directory listing of your trading strategies.

## Function listStrategySchema

This function helps you see a complete overview of all the trading strategies you've added to the backtest-kit system. It fetches a list of these strategies, essentially providing a handy way to understand what strategies are available for testing. You can use this to check your setup, create documentation, or even build user interfaces that dynamically display available strategies. Think of it as a "what's available" report for your backtesting environment.


## Function listSizingSchema

This function allows you to see all the different sizing strategies that are currently set up within the backtest-kit framework. It essentially gives you a complete list of how the framework is configured to handle position sizing for trades. Think of it as a way to inspect the sizing rules that will be used when placing orders, helping with troubleshooting or when you want to understand exactly how trade sizes are determined. The function returns a list of sizing configurations, making it easy to access and work with.

## Function listRiskSchema

This function lets you see all the risk schemas that are currently set up within the backtest-kit framework. Think of it as a way to peek under the hood and understand how risk is being managed in your simulations. It gives you a list of all the risk configurations that have been added, making it handy for troubleshooting, generating documentation, or creating user interfaces that need to display this information. Essentially, it's your window into the risk management settings.


## Function listMemory

This function lets you peek inside the memory of your trading signal, retrieving all the stored entries. It's like looking at a list of saved snapshots.

You provide a bucket name to specify which collection of memories you're interested in.

The function handles the complexities of figuring out whether you're in a backtesting environment or live trading, and it knows which signal is currently active, so you don't have to.

It returns an array, where each item represents a memory with a unique ID and its content. The content will be of a type you define when you call the function.


## Function listFrameSchema

This function lets you see all the different data structures, or "frames," that your backtest kit is using. Think of it as a way to peek under the hood and understand how your trading strategy is organized. It returns a list of these frame schemas, which you can use to check for errors, create documentation, or even build tools that automatically display information about your trading system. Basically, it's a handy tool for inspecting your data layout.


## Function listExchangeSchema

This function gives you a list of all the different exchanges that backtest-kit knows about. Think of it as a directory of supported exchanges. It's helpful when you're trying to understand what exchanges are available for your backtests or when you need to display this information in an application. This information is retrieved by looking at all the exchanges that were previously added using the `addExchange()` function.

## Function hasTradeContext

This function helps you determine if you're in a situation where you can safely use the tools for interacting with the exchange. Specifically, it confirms that both the execution and method contexts are running. You'll need this to be true before you can reliably call functions like `getCandles`, `getAveragePrice`, or `formatPrice`—basically, anything that needs to talk to the exchange or handle calculations within a trade. Think of it as a quick check to make sure everything is set up correctly before you proceed.

## Function hasNoScheduledSignal

This function helps you quickly check if a scheduled signal exists for a specific trading pair. 

It returns `true` if no scheduled signal is currently active for that symbol, and `false` otherwise.

Think of it as the opposite of checking *for* a scheduled signal – you can use this to make sure signals aren't generated prematurely.

It smartly figures out whether you're running a backtest or a live trading session without you having to specify.

To use it, just provide the trading pair's symbol (like "BTCUSDT").


## Function hasNoPendingSignal

This function, `hasNoPendingSignal`, checks whether there's currently a signal waiting to be triggered for a specific trading symbol. It's essentially the opposite of `hasPendingSignal`, and it's designed to help you control when new signals are created. You can use it to make sure that signals aren't generated prematurely. It cleverly figures out whether the system is in backtesting mode or live trading mode without you needing to specify. To use it, you simply provide the symbol you want to check, like "BTCUSDT".

## Function getWalkerSchema

This function helps you find the blueprint or definition for a specific trading strategy or "walker" within the backtest-kit system. Think of it as looking up the rules and structure of a particular trading method. You give it the name of the walker you're interested in, and it returns a detailed description of how that walker is built and what it does. This is useful for understanding how different strategies are configured and how they interact within the backtesting environment.


## Function getTotalPercentClosed

This function tells you what percentage of your position is still open for a particular trading pair. It's a way to see how much of your holdings haven't been closed out, with 100 meaning you're holding the entire position and 0 meaning it’s completely closed.

It handles situations where you’ve added to your position over time using dollar-cost averaging (DCA), giving you an accurate picture of the percentage held even with partial closes along the way.

The function knows whether it's running in a backtest or a live trading environment, so you don't need to worry about setting that. You just provide the symbol, like "BTCUSDT", and it will give you a number representing the percentage closed.


## Function getTotalCostClosed

This function helps you figure out the total cost in dollars for any position you're currently holding. It's particularly useful if you've been buying into a position gradually using a dollar-cost averaging (DCA) strategy and have also been closing parts of it along the way. The function automatically recognizes whether the backtest is running in a simulation or in a live trading environment. You just need to provide the trading pair's symbol (like "BTC-USDT") to get the total cost.

## Function getTimestamp

This function gives you the current timestamp, but what it actually returns depends on whether you're in a backtest or running live. If you're testing historical data, it’ll give you the timestamp for the specific time period being analyzed. Otherwise, when you’re actually trading, it provides the current, real-time timestamp. It's a simple way to know what time it is within your trading system.

## Function getSymbol

This function allows you to retrieve the symbol you're currently trading, like 'AAPL' or 'BTCUSDT', from the environment where your backtest is running. It returns a promise that resolves to the symbol as a string. Essentially, it tells you what asset your trading strategy is focused on at any given point during the backtest.


## Function getStrategySchema

This function helps you find out the structure and details of a specific trading strategy that's been registered within the backtest-kit framework. Think of it as looking up the blueprint for a strategy. You give it the name of the strategy you're interested in, and it returns a description of what that strategy looks like – what inputs it needs, what calculations it performs, and generally how it's set up. It’s useful for understanding a strategy's requirements or validating its configuration.


## Function getSizingSchema

This function helps you find a specific sizing strategy that's already set up in your backtest. Think of sizing as how much of an asset you're going to trade based on your available capital and risk tolerance. You provide the name of the sizing strategy you're looking for, and it returns the detailed configuration for that strategy. It's a quick way to access the settings for a sizing method without having to recreate it.

## Function getSignalState

This function helps you track and manage data specific to an active trading signal. It retrieves the current signal's state, figuring out which signal is active on its own. 

If there's no active signal, it'll let you know with a warning and use a default value you provide. 

The function intelligently adapts to whether you're in a backtesting or live trading environment.

It’s particularly useful for strategies that want to gather information about each trade, like how long it was open or its maximum gain, across multiple trades managed by a single signal. Think of it as a way to build up a picture of how a strategy performs over time. 

For example, it can be used to identify trades that have been open for an extended period and haven't reached a desired profit level, allowing for automated exits.

The `dto` parameter holds the information the function needs.


## Function getSessionData

This function lets you retrieve data that's specifically linked to a particular trading symbol, strategy, exchange, and timeframe. Think of it as a place to store information that needs to be remembered between candles during a backtest or even when the program restarts in live mode. It's great for things like holding onto the results of complex calculations or saving the state of indicators so you don’t have to recompute them every time. 

The function returns the stored value, or null if nothing is currently stored for that particular combination of settings.

You just need to provide the symbol of the trading pair you're interested in.


## Function getScheduledSignal

This function helps you retrieve the signal that’s been planned and scheduled to be executed for a specific trading pair. Think of it as checking what the strategy is currently set to do. 

It will return the details of the signal if one is active. If nothing is scheduled, it'll tell you by returning null.

It cleverly figures out whether you’re in a backtesting environment or a live trading scenario without you needing to specify.

You simply provide the trading pair symbol (like 'BTCUSDT') to find out the relevant scheduled signal.

## Function getRiskSchema

This function helps you find the specific details about a particular type of risk your trading strategy uses. Think of it as looking up a blueprint – you give it the name of the risk (like "VolatilityRisk" or "PositionSizeRisk"), and it gives you back a structured description of how that risk is calculated and managed. It's useful for understanding how different risk factors are incorporated into your backtesting process. You'll need to know the exact name of the risk you’re looking for to use this function.

## Function getRawCandles

This function allows you to retrieve historical candle data for a specific trading pair and timeframe. You have a lot of flexibility in how you request this data, allowing you to specify the number of candles, a start date, and an end date. The function automatically handles date calculations and ensures that you're not accidentally looking into the future when requesting data.

You can choose to specify a limit of candles to retrieve, or define a date range from which candles will be fetched. If you just want a specific number of recent candles, the function will use the current execution context to determine the starting point.

Here's a breakdown of the available parameters:

*   `symbol`: The trading pair you're interested in (e.g., BTCUSDT).
*   `interval`: The timeframe for the candles (like 1 minute, 5 minutes, hourly, etc.).
*   `limit`: The number of candles you want to get.
*   `sDate`: The starting date for the candle data.
*   `eDate`: The ending date for the candle data.


## Function getPositionWaitingMinutes

This function lets you check how long a pending trading signal has been waiting to be executed. It tells you the number of minutes the system has been holding back on taking action based on a planned signal. 

If there isn't a signal currently waiting, it will return null to indicate that.

To use it, you simply provide the trading pair symbol, like "BTCUSDT," and it will return the waiting time in minutes or null.

## Function getPositionPnlPercent

This function helps you understand how your open trades are performing financially. It calculates the percentage profit or loss on your current position, taking into account things like partial trade closures, dollar-cost averaging, a little bit of slippage, and fees. If you don't have any open trades, it will return null. It smartly figures out whether you're in a backtest or a live trading environment and automatically gets the current market price to give you an accurate percentage. You just need to provide the trading pair symbol, like "BTCUSDT."


## Function getPositionPnlCost

This function helps you figure out how much you're currently losing or gaining on a trade that's still open. It calculates the unrealized profit and loss in dollars, considering factors like how the price has moved since you bought it, any partial closing of the position, and even the effect of slippage and fees.

If there isn't a trade currently in progress, it will return null.

It takes care of knowing whether you're in a backtest or live trading environment and automatically gets the latest price to perform the calculation, so you don’t have to worry about those details. You just need to provide the symbol of the trading pair you’re interested in.

## Function getPositionPartials

This function lets you peek at how your trading position has been partially closed off, either for profit or to limit losses. It provides a list of these partial closure events, detailing the percentage closed, the price used for the closure, the cost basis at the time, and how many entries were factored in. 

If you don't have any signals currently running, the function will return null. If partial closures have occurred but there aren't any right now, it'll give you an empty list. You specify which trading pair you're interested in when you call the function.

## Function getPositionPartialOverlap

This function helps you avoid accidentally closing positions partially at nearly the same price multiple times. It checks if the current market price falls within a defined tolerance range around any previously executed partial close prices for a specific trading pair. Essentially, it verifies if a new partial close order would be too close to a previous one, helping to prevent unnecessary orders. 

You provide the trading symbol and the current price, and optionally a custom tolerance range. The function calculates the allowed tolerance based on the partial close price and a percentage (defaults to 1.5% up or down). It returns true if the current price falls within that tolerance of a prior partial close, and false otherwise. If no partial closes have been made yet, it also returns false.

## Function getPositionMaxDrawdownTimestamp

This function helps you find out when a specific trading position experienced its biggest loss. It looks at a position’s history and identifies the exact timestamp – a date and time – when the price dipped to its lowest point. 

Think of it as pinpointing the moment a trade hit its lowest value.

To use it, you provide the symbol of the trading pair (like BTCUSDT) you're interested in, and the function will return that timestamp. If there’s no active trading position for that symbol, it will return null.

## Function getPositionMaxDrawdownPrice

This function helps you understand the potential risk of a specific trade you've made. It calculates the lowest price a position reached while it was open, essentially showing you the maximum drawdown experienced during that period. Think of it as a way to see how far "in the red" the trade went at its worst point. 

It needs the symbol of the trading pair (like "BTCUSDT") to look up the relevant position.

If no trading signal is currently active for that symbol, the function will return null, meaning it can't calculate the drawdown.


## Function getPositionMaxDrawdownPnlPercentage

This function helps you understand the performance of a specific trading position. It calculates and returns the maximum drawdown percentage of the profit and loss (PnL) for that position. Essentially, it tells you the biggest drop in profit the position experienced from its highest point. 

If there's no trading signal related to the position, the function will return null. 

You'll need to provide the trading pair symbol (like "BTC/USD") to retrieve the information.

## Function getPositionMaxDrawdownPnlCost

This function helps you understand the financial impact of a trading position. 

It calculates the total cost, expressed in the quote currency, that you incurred when your position reached its lowest point. 

Essentially, it tells you how much money you lost at the worst moment for that specific trading pair.

If there's no active trading signal for that symbol, the function will indicate that by returning null. You need to provide the trading pair's symbol as input to get this information.

## Function getPositionMaxDrawdownMinutes

This function helps you understand how far back the worst loss point occurred for a specific trading pair. It calculates the number of minutes that have passed since that low point. Think of it as a measure of how long ago things got really tough for a particular trade. If the function returns null, it means there’s no current trading signal to analyze. You'll provide the trading pair’s symbol to check, like 'BTCUSDT'.

## Function getPositionLevels

getPositionLevels helps you see the prices at which your initial investment and any subsequent DCA (Dollar-Cost Averaging) buys were made for a particular trading pair. 

It gives you a list of prices, starting with the original price when you first started building your position, followed by any prices used when you added more to your holdings with commitAverageBuy.

If there's no active trade signal, it will return nothing. If you made just the initial purchase and didn't add any more, it'll show only the original price. You provide the trading pair symbol – like BTCUSDT – to retrieve the relevant position levels.


## Function getPositionInvestedCount

This function helps you track how many times you've adjusted a trade using dollar-cost averaging (DCA) for a specific trading pair. 

It tells you the count of DCA entries made for the current trade. A value of 1 means it's the original entry, while a higher number indicates subsequent DCA adjustments.

If there's no active trade currently being managed, the function returns null. 

The function automatically determines whether it's running in a backtesting or live trading environment.

You just need to provide the symbol of the trading pair (like BTCUSDT) to get the count.


## Function getPositionInvestedCost

This function helps you figure out how much money you've invested in a particular trading pair, like BTC-USDT. It calculates the total cost of all the purchases made for that pair, based on the entry costs recorded when those purchases were committed. If there are no pending signals for that symbol, it will return null, meaning no investment has been tracked yet. The function cleverly adapts to whether you’re running a backtest or a live trading session. You just need to provide the symbol of the trading pair you're interested in.


## Function getPositionHighestProfitTimestamp

This function helps you find the exact moment a specific trading position achieved its peak profit. It tells you when the price reached the highest point where the position was most profitable. 

If there's no active trading signal for the given symbol, the function won't be able to provide a timestamp, and will return null. 

You just need to give it the symbol of the trading pair (like BTCUSDT) to get the timestamp.

## Function getPositionHighestProfitPrice

This function helps you find the highest price a position has reached while being profitable. 

Think of it as tracking the peak of how well a trade has performed. It starts when a position is opened, recording the initial entry price. 

As new price data comes in, it continuously updates this record. For long positions, it looks for the highest price above the entry price, and for short positions, the lowest price below the entry price.

You'll always get a value back when a position is active – even if it's just the entry price itself. If there are no signals pending, then this function will return null.

## Function getPositionHighestProfitMinutes

This function helps you understand how long a trading position has been away from its best performance. It calculates the time, in minutes, since the position reached its highest profit. Think of it as a way to see how far a trade has fallen from its peak gain. 

It’s essentially the same as checking how long a trade has been in a drawdown, showing the duration since its most profitable point. If there's no active trading signal, the function will return null. You'll need to provide the trading pair symbol to use it.

## Function getPositionHighestProfitDistancePnlPercentage

This function helps you understand how far your trading position has moved from its most profitable point. It calculates the difference between the highest profit percentage you've seen and your current profit percentage, but only considers the positive difference (so it will always be zero or a positive number). 

Think of it as a measure of how much "upside" you might still have based on past performance. If no trading signals are currently active, the function won't return any value. 

You just need to provide the trading symbol (like "BTCUSDT") to get this information.


## Function getPositionHighestProfitDistancePnlCost

This function helps you understand how far your trading position is from its potential maximum profit. It calculates the difference between the highest profit you *could* have made (based on past performance) and the profit you’ve currently made. 

Essentially, it tells you how much room you still have to grow in terms of profit. 

If there’s no signal available for the specified trading pair, the function will return null. You provide the trading pair symbol as input, like "BTC-USDT", to get this information.

## Function getPositionHighestProfitBreakeven

This function helps you check if a trade could have broken even at its highest potential profit point. It essentially verifies whether reaching that profit level would have also meant reaching the breakeven point.

If no open trades are currently being tracked, the function will indicate that it can’t calculate this.

To use it, you simply provide the trading pair's symbol, like "BTCUSDT", and the function will return `true` if a breakeven was mathematically possible at the highest profit, or `false` otherwise. If there's no active trade, it returns null.

## Function getPositionHighestPnlPercentage

This function helps you understand how well a specific trading position has performed. It tells you the highest percentage profit that was achieved at any point while the position was open. 

To use it, you'll need to provide the trading pair symbol, like "BTC-USD". 

The function returns this highest profit percentage. If there's no trading signal associated with the position, it will return null.

## Function getPositionHighestPnlCost

This function lets you find out the highest profit and loss cost that occurred while a specific trading position was open. Essentially, it tells you the most expensive point the position reached regarding profits and losses, measured in the currency of the asset being traded. 

It focuses on a single trading pair, identified by its symbol.

If there's no record of trading signals for that position, the function will return null.

## Function getPositionHighestMaxDrawdownPnlPercentage

This function helps you understand how risky a trading position is. It calculates the maximum percentage loss a position has experienced, measuring the difference between its current profit and the lowest point it reached during a downturn. Essentially, it shows you how far a position fell before recovering. The result is a percentage representing that drawdown. If no trading signals are present, the function won't return a value. You provide the trading symbol, such as "BTCUSDT," to specify which position you’re analyzing.

## Function getPositionHighestMaxDrawdownPnlCost

This function helps you understand how much your trading position is currently away from its lowest point in terms of profit and loss. It calculates the difference between your current profit and loss and the largest loss experienced. 

Think of it as measuring how far you've recovered from a potential downturn. 

If no trading signals are currently active for a particular symbol, the function will return nothing. You'll need to provide the symbol of the trading pair you want to analyze, like "BTC-USDT".


## Function getPositionEstimateMinutes

This function helps you understand how long a trading position is expected to last. It looks at the current signal and tells you the initial estimated duration in minutes. 

Essentially, it gives you the original time estimate that was set when the trading signal was generated, representing how long the position was anticipated to be open before potentially expiring.

If there's no active signal, the function will return null. You provide the trading pair symbol (like "BTC-USDT") to check the estimate.

## Function getPositionEntryOverlap

This function helps you avoid accidentally placing multiple DCA (Dollar-Cost Averaging) orders at nearly the same price. It checks if the current market price falls within a defined tolerance range around your existing DCA entry levels.

Essentially, it prevents you from setting a new DCA order if the price is already very close to a previous one you've established.

The function takes the trading symbol and the current price as input, and optionally allows you to customize the tolerance range around your DCA levels. It returns `true` if the current price falls within this acceptable range of any existing DCA level, and `false` otherwise. This helps maintain a well-structured and efficient trading strategy.


## Function getPositionEntries

This function lets you see the details of how a trade was built, especially if it involves Dollar-Cost Averaging (DCA). It returns a list of entries, showing the price and the amount spent for each step of opening or adding to a position.

If there’s no active trade being built, it will tell you that. If a trade was started but no DCA was used, you'll get a list with only one entry.

Each entry in the list will tell you the price at which the trade was made and the amount of money invested in that specific step. The function requires the trading pair symbol (like BTCUSDT) to know which trade to look at.

## Function getPositionEffectivePrice

This function helps you understand the average price at which you've acquired a position in a trade. It calculates a weighted average, taking into account any partial closes and DCA (Dollar-Cost Averaging) entries you've made. 

Essentially, it figures out your effective entry price, which is different from just the opening price.

If there's no active trade signal, it won’t be able to provide a price and will return null. 

It intelligently determines whether it's running in a backtest or a live trading environment without you needing to specify. You just need to provide the symbol of the trading pair you're interested in.

## Function getPositionDrawdownMinutes

getPositionDrawdownMinutes tells you how much time has passed since your current trade reached its highest profit point. 

Think of it as a measure of how far your trade has fallen from its best moment. 

The number represents the minutes elapsed, and it starts at zero when the trade initially peaks. 

It steadily increases as the price moves away from that peak profit.

If there's no active trade, it won’t return a value.

You provide the symbol of the trading pair (like BTCUSDT) to get this drawdown information.

## Function getPositionCountdownMinutes

getPositionCountdownMinutes lets you check how much time is left before a trading position expires. It calculates this by looking at when the position started and an estimated expiration time. 

You'll get the countdown in minutes, but the number will never be negative—it'll always be zero or a positive value.

If there’s no pending signal for a position, this function will return null, meaning it can't determine the countdown.

To use it, you just need to provide the symbol of the trading pair, like "BTC/USDT".

## Function getPositionActiveMinutes

This function lets you check how long a specific trading position has been open. It returns the time, in minutes, that the position has been active. 

If there isn't a pending signal for that position, the function will return null, indicating there’s nothing to measure. 

You provide the trading pair’s symbol, like “BTCUSDT”, to specify which position you’re interested in.


## Function getPendingSignal

This function lets you check if your trading strategy currently has a pending order waiting to be filled. 

It tells you about the signal that's waiting, like the price level it's set at.

If there isn't a pending order right now, it simply returns nothing.

You don't have to worry about whether you're running a test or a live trade; the function figures that out on its own.

To use it, you just need to provide the symbol of the trading pair you’re interested in, like "BTCUSDT".

## Function getOrderBook

This function allows you to retrieve the order book for a specific trading pair, like BTCUSDT. It connects to the exchange you've configured within the backtest-kit system.

The function takes the trading pair symbol as input and optionally allows you to specify the depth of the order book you want to retrieve – how many levels of bids and asks you want to see. The system automatically handles the timing of the request based on the current backtesting context. The exchange might actually use this timing information during a backtest, or it might ignore it when running in live trading mode.

## Function getNextCandles

This function lets you grab a batch of historical candles for a specific trading pair and timeframe. It's designed to retrieve candles that come *after* the current time the system is using, ensuring you're looking forward in time. 

You tell it which symbol you're interested in (like "BTCUSDT"), the candle interval (like "1h" for one-hour candles), and how many candles you want to see. 

The function handles the details of querying the underlying exchange to get those candles for you. The result is an array of candle data, each candle representing a specific point in time.


## Function getMode

This function tells you whether the backtest-kit is currently running a simulation (backtest mode) or is connected to a live trading environment. It returns a simple string: "backtest" if it's a simulation, or "live" if it's actively trading. You can use this to adapt your trading logic depending on the context – for example, to display different information or adjust risk parameters. It’s a quick way to check the operational status of your trading system.

## Function getMinutesSinceLatestSignalCreated

This function helps you figure out how much time has passed since the last trading signal was generated for a specific trading pair. 

It essentially tells you the number of whole minutes that have gone by.

Whether the signal is still active or has already ended doesn’t matter – it just looks at the most recent signal.

This can be really helpful for things like setting up a "cool-down" period after a stop-loss is triggered.

The function first checks your historical backtest data, and if it can't find anything there, it checks your live data. If there are no signals at all, it’ll return null. It automatically adjusts based on whether you're running a backtest or live trading.

You just need to provide the symbol of the trading pair you’re interested in.

## Function getMaxDrawdownDistancePnlPercentage

This function helps you understand how risky a trading strategy has been. It calculates the largest percentage difference between the highest profit and the lowest loss your position has experienced. 

Essentially, it's a way to measure the potential downside of a strategy – how far it could fall from its peak. The result is a percentage, and it will always be zero or positive. 

You need to provide the trading symbol, like "BTC-USD," to get the drawdown percentage for that specific instrument. If there's no trading activity, the function will return null.

## Function getMaxDrawdownDistancePnlCost

This function helps you understand the riskiness of a trading strategy by calculating the maximum drawdown distance based on profit and loss. It essentially measures the biggest difference between the highest profit you've made and the lowest point you've fallen to.

The result represents the potential loss you could have experienced from the peak of your profits. 

It focuses specifically on a single trading pair, which you specify when calling the function. 

If no trading signals exist for that pair, it won't be able to provide a drawdown distance.

## Function getLatestSignal

This function helps you retrieve the most recent trading signal, whether it's currently active or has already been closed. It's really handy for things like implementing cooldown periods – for example, you could prevent the system from opening a new trade until a certain amount of time has passed after a stop-loss was triggered. 

It checks for signals in both the historical backtest data and the live trading data, and will return nothing if no signal is found. It intelligently figures out if it's running in backtest or live mode, so you don't need to worry about specifying that.

You provide the trading pair symbol (like 'BTCUSDT') to identify which signal you’re looking for.


## Function getFrameSchema

The `getFrameSchema` function helps you find the blueprint for a particular frame within your backtest. Think of a frame as a building block in your trading strategy – it defines the data and calculations involved. This function takes the frame's unique name as input and returns a detailed description of its structure, telling you exactly what data it contains and how it's organized. It's useful for inspecting the layout of your trading environment.


## Function getExchangeSchema

This function helps you find the details of a specific cryptocurrency exchange that's been set up within the backtest-kit framework. You give it the name of the exchange, like 'Binance' or 'Coinbase', and it returns a structured description of how that exchange works – things like the format of its trade data, order book information, and more. Essentially, it's a way to get the blueprint for how the backtest-kit understands and interacts with a particular exchange. It lets your backtesting system know how to interpret data coming from that exchange.

## Function getDefaultConfig

This function provides a starting point for configuring your backtests. It returns a set of default values for various settings that control how the framework operates, such as limits on data processing, notification frequency, and experimental features. Think of it as a cheat sheet showing you all the knobs you *can* tweak and what they do by default. It's really handy for understanding what's going on behind the scenes and building your own custom configuration.

## Function getDefaultColumns

This function provides a set of pre-defined column configurations used for generating reports. It essentially gives you a blueprint for how columns are structured in your backtesting analysis.

You can use it to understand the available columns for different data types like closed trades, heatmaps, live ticks, and more. 

It returns a read-only object, meaning you can examine it but not directly modify it, ensuring consistency in your report generation. It's a great resource to explore the structure and options for your backtest reports.


## Function getDate

This function provides a way to retrieve the current date being used within your trading strategy. 

It behaves differently depending on whether you're running a backtest or trading live. 

During a backtest, it gives you the date associated with the timeframe being analyzed. When running live, it provides the current, real-time date.

## Function getContext

This function lets you access important details about where and how a particular piece of code is running within the backtest-kit framework. Think of it as getting a snapshot of the environment – it provides information like which method is currently executing and other relevant data. It's a promise, so you'll get this information back asynchronously. This context object is helpful for understanding the bigger picture of what's happening during a backtest.

## Function getConfig

This function allows you to see the current settings used by the backtest-kit framework. It provides a snapshot of various configuration values, like how often things are checked, limits on data processing, and settings related to notifications and signal generation. The returned values are a copy, so any changes you make won’t affect the actual running configuration. Think of it as a way to peek under the hood and understand how the system is operating.

## Function getColumns

This function gives you access to the definitions of the columns used in your backtest reports. Think of it as a way to see how your data will be organized and displayed. It returns a snapshot of the column configurations, so any changes you make to it won't affect the original setup used by the backtest kit. You can use this to understand what data is available and how it’s being structured.

## Function getCandles

This function allows you to retrieve historical price data, or "candles," for a specific trading pair. 

You tell it which trading pair you're interested in (like BTCUSDT), how frequently the data should be grouped (every minute, every hour, etc.), and how many candles you need.

The function then goes to the exchange you’re connected to and pulls that data, giving you a list of candles going back in time from the current moment.

Essentially, it's your way to see how a trading pair has performed over a period.


## Function getBreakeven

This function helps you determine if a trade has become profitable enough to cover the fees and potential slippage associated with it. It calculates a threshold based on predefined percentages to represent these costs. You provide the trading symbol and the current market price, and the function will tell you whether the price has moved sufficiently in a positive direction to reach that breakeven point. This is useful for understanding if a trade is truly in the green, considering all associated costs. It works seamlessly whether you’re in backtesting or live trading mode.

## Function getBacktestTimeframe

This function lets you find out the time period used for a backtest for a specific cryptocurrency pair, like BTCUSDT. It returns a list of dates representing the start and end points of that backtest period. You give it the symbol of the trading pair, and it tells you the dates it covers. Essentially, it helps you understand the historical data being used for a simulation.

## Function getAveragePrice

This function helps you figure out the Volume Weighted Average Price, or VWAP, for a specific trading pair like BTCUSDT. It looks at the most recent five minutes of price data – high, low, and close – to do the calculation.  Essentially, it weighs the typical price of each candle by the trading volume during that period. If there's no trading volume to work with, it just calculates a simple average of the closing prices instead. You just need to provide the symbol of the trading pair you're interested in.

## Function getAggregatedTrades

This function retrieves historical trade data for a specific trading pair, like BTCUSDT. It pulls this data directly from the exchange that’s connected to the backtest-kit.

You can request a specific number of trades by using the 'limit' parameter; if you don’t provide one, it will fetch trades from a defined time window. The function essentially collects trades from the past, either a fixed amount or all trades within a certain period, allowing you to analyze trading activity.


## Function getActionSchema

This function helps you get the details of a specific action that your trading strategy uses. Think of it as looking up the blueprint for how an action should be executed. You provide the name of the action, and it returns a schema that describes things like what inputs the action expects and what it does. This is useful for validating that your actions are set up correctly and that they're behaving as expected.

## Function formatQuantity

This function helps you display the correct amount of a trading pair, like Bitcoin against USDT. It automatically handles the right number of decimal places based on the specific exchange you're using. You give it the symbol of the trading pair (e.g., "BTCUSDT") and the numerical quantity, and it returns a formatted string ready to be displayed. 

It essentially does the complex calculations for you so you don’t have to.


## Function formatPrice

This function helps you display prices correctly for different trading pairs. It takes a trading symbol like "BTCUSDT" and a raw price as input. 

Then, it uses the specific rules of that exchange to format the price, ensuring the right number of decimal places are shown. This makes your output look professional and consistent with the exchange’s standards.


## Function dumpText

The `dumpText` function lets you save text data, like logs or reports, associated with a specific signal within your backtest or live trading environment. It handles the details of figuring out which signal to attach this data to, based on what's currently running. You provide the data as an object including the bucket name, a unique ID for this data, the actual text content, and a description to help identify it later. Think of it as a convenient way to record events and observations during your tests or trades.


## Function dumpTable

This function helps you display data in a clear, table format, making it easy to understand the results of your trading simulations. It takes an array of objects – each object representing a row in the table – and displays them.

The function intelligently determines the environment it's running in (backtest or live) and handles the display within the context of the current trading signal.

It dynamically figures out the column headers for the table by looking at all the keys used in the data. You provide the data, and it takes care of the rest, making it super convenient for reporting and analysis.


## Function dumpRecord

This function allows you to save a simplified, flat data record, often used for debugging or auditing purposes. It’s designed to associate this record with a specific signal, meaning it's linked to a particular trading event or action. 

Behind the scenes, it handles complexities by automatically figuring out which signal to attach the record to, and whether it's running in a simulated backtest environment or a live trading setting. 

You provide a data object, which includes the name of the bucket where the record will be stored, a unique identifier for the dump, the actual data record itself (as key-value pairs), and a brief description of what the record represents. The function then takes care of saving this information securely.


## Function dumpJson

The `dumpJson` function lets you record data as a formatted JSON block associated with a specific signal. Think of it as a way to save snapshots of your trading logic’s state during a backtest or live run. It takes a description and the data you want to save, and it automatically handles things like figuring out whether you're in a backtest or a live environment. You provide details like the bucket name, a unique ID for the dump, the JSON data itself, and a description so you know what it represents. The function then saves this data, linked to the current signal’s activity.


## Function dumpError

The `dumpError` function helps you record and report errors that happen during your backtesting or live trading. It takes a description of the error, along with information about which data "bucket" and unique identifier ("dumpId") it relates to. 

This function is designed to automatically handle the context of where the error occurred, such as a specific trading signal that was being processed. It also figures out whether it's running a backtest or a live trade, ensuring the error information is properly communicated based on the environment. Essentially, it simplifies the process of logging and understanding errors within your trading strategies.


## Function dumpAgentAnswer

This function helps you save a complete record of your agent's conversations. It's useful for debugging and understanding how the agent is behaving during a backtest or live trading session. The function automatically handles figuring out which signal the conversation belongs to, and whether you’re running a backtest or a live trade.

You provide a set of messages, a description, a bucket name and a unique dump ID to identify the conversation you’re saving. The function takes care of the rest, storing the conversation history for later review.


## Function createSignalState

This function helps you manage and track the state of your trading signals in a structured way. It creates a pair of functions – one to get the current state and another to update it – that are linked to a specific trading context. You don’t need to manually specify the signal ID; it figures it out on its own.

It's particularly useful for complex strategies, like those driven by large language models, where you need to gather data (like how long a trade is open or its maximum profit) during the trade's lifecycle. Think of it as a way to keep track of important details about each trade as it progresses, helping you refine your strategies over time.


## Function commitTrailingTakeCost

This function lets you set a specific price level for your trailing take-profit order. It's a shortcut that figures out how to adjust the percentage shift needed based on your original take-profit distance. The framework handles the details of knowing whether you're in a backtest or a live trading environment, and it automatically gets the current market price for accurate calculations. You simply tell it which trading pair and the absolute price you want your take-profit to be at.

## Function commitTrailingTake

This function helps you fine-tune your take-profit levels for existing pending orders, specifically using a trailing stop approach. It’s designed to work with the original take-profit distance you initially set, not a potentially adjusted one. This is important because it avoids compounding small errors over time.

The `percentShift` parameter lets you nudge your take-profit. A negative value pulls it closer to your entry price, making it more cautious, while a positive value pushes it further out, making it more aggressive.

The system prioritizes caution. It only updates the take-profit if the new value is *more* conservative – meaning closer to the entry price for longs and further from the entry price for shorts. This ensures that your trailing stop consistently moves in a way that protects your profits.

The function smartly figures out whether it's being used in a backtesting environment or a live trading scenario.


## Function commitTrailingStopCost

This function lets you set a specific price for your trailing stop-loss order. It's designed to make things easier, automatically calculating the necessary shift based on your original stop-loss distance. 

Think of it as a shortcut – you tell it the exact price you want your stop-loss to be, and it figures out how to adjust the trailing stop to reach that level. It also handles whether you're running a backtest or a live trade, and grabs the current price to ensure accurate calculations. 

You provide the trading pair (like BTCUSDT) and the target stop-loss price, and it does the rest. The function will then confirm whether the new stop loss was committed.


## Function commitTrailingStop

This function lets you fine-tune the trailing stop-loss for your trades. Think of it as making small adjustments to how far away your stop-loss is from your entry price.

It's designed to work carefully, always basing calculations on the initial stop-loss distance you set. This avoids errors if you make adjustments repeatedly. 

The adjustments you make are smart – a smaller change will always be applied if it offers better protection for your profits. 

For long positions, the stop-loss can only move further away from the entry price. For short positions, it can only move closer.

The function automatically figures out if you are running a backtest or a live trading session.

You'll need to provide the trading pair symbol, the percentage adjustment you want to make, and the current market price.

## Function commitSignalNotify

This function lets you send out informational messages related to your trading strategy. Think of it as a way to leave notes for yourself or trigger external alerts – without actually changing your positions. 

It's really convenient because it automatically pulls information like the strategy name, exchange, and the current price, saving you the trouble of gathering that data yourself. You can also include extra details in the notification using the `payload` parameter, letting you customize the message. This is perfect for tracking events within a trade, like when an indicator hits a certain level.

## Function commitPartialProfitCost

The `commitPartialProfitCost` function helps you take partial profits by specifying a dollar amount you want to close. It simplifies the process by automatically calculating the percentage of your position needed to reach that dollar value. 

This function is useful when you want to lock in some gains while still letting your trade run.

It handles the details of determining the current price and works seamlessly whether you're backtesting or live trading. 

To use it, you simply provide the symbol of the trading pair and the dollar amount you want to close. For instance, if you specify $150, it will close enough of the position to realize a profit of $150. The function ensures the price is moving in a direction that aligns with your take profit goal.

## Function commitPartialProfit

This function lets you automatically close a portion of your open trade when the price moves in a profitable direction, essentially moving you closer to your take profit target. It’s designed to help you lock in some profits along the way. 

You specify the trading symbol and the percentage of your position you want to close, for example, closing 25% of your position. The system will handle whether it's running in a backtesting or live trading environment. 

Keep in mind, this function only works if the price is actually heading towards your take profit level.


## Function commitPartialLossCost

This function helps you automatically close a portion of your position when the price is moving in a losing direction. It's a simple way to manage losses by specifying how much money you want to recover – for example, closing a position to recoup $100. The function handles the details of calculating what percentage of your position that dollar amount represents, and it works whether you're in a backtesting or live trading environment. It automatically figures out the current price to determine if the price is indeed trending toward your stop loss. You just provide the symbol you’re trading and the dollar amount you want to recover.


## Function commitPartialLoss

This function lets you partially close an existing trade when the price is moving in a way that would trigger your stop-loss. 

Essentially, it allows you to reduce your risk by closing a portion of your position, even if you haven't hit the full stop-loss price. 

You specify the trading symbol and the percentage of the position you want to close, up to 100%. The system handles whether you're in a backtesting or live trading environment.


## Function commitClosePending

This function lets you cancel a pending trade without interrupting your strategy’s operation. It’s useful when you want to clear a signal that was previously set, but still want your strategy to continue generating signals and potentially opening new trades. Think of it as a way to undo a ‘pause’ on a trade without completely stopping the strategy. This function handles whether you're in a testing (backtest) or live trading environment automatically. You can optionally add a note or reference ID to the cancellation for record-keeping.

## Function commitCancelScheduled

This function lets you cancel a previously scheduled signal for a specific trading pair. Think of it as removing a signal that was waiting to be triggered. It won’t disrupt your trading strategy – the strategy will keep running and can still generate new signals. It's also designed to work seamlessly whether you're backtesting or trading live, handling the mode automatically. You can optionally include extra information with the cancellation, like a note or an ID, if you need to keep track of why you canceled the signal.

## Function commitBreakeven

The `commitBreakeven` function helps manage your trading positions by automatically adjusting the stop-loss order. It moves your stop-loss to the entry price – essentially eliminating risk – once the price has moved favorably enough to cover any transaction fees and a small slippage buffer.

This function simplifies the process by automatically determining whether it's running in a backtesting or live trading environment and retrieving the current price for calculation. You just need to provide the trading symbol (like BTCUSDT) to trigger this process. It's designed to help protect profits and avoid unnecessary losses.


## Function commitAverageBuy

The `commitAverageBuy` function helps you gradually build up a trading position through dollar-cost averaging. It essentially adds a new buy order to your existing plan, spreading out your investment over time. 

The function automatically determines if it's running in a backtest or a live trading environment and pulls the current market price to execute the buy. 

It keeps track of the average price you've paid for the asset, updating a running average as new buys are added.  You'll also receive an event notification whenever a new average buy is committed. 

You only need to provide the trading symbol, but you can also specify a `cost` parameter if required.


## Function commitActivateScheduled

This function lets you manually trigger a scheduled signal before the price actually hits the target you set. It's useful when you want to jumpstart a trade based on other factors.

Think of it as setting a flag to tell the trading strategy, "Hey, I want this signal to fire now!" 

The strategy will then pick up on that flag during its regular check and execute the trade.

It automatically knows whether it's running a backtest or a live trade, so you don’t have to worry about that.

You can also include some extra information with the activation, like an ID or a note, using the optional payload.


## Function checkCandles

The `checkCandles` function is a utility that helps ensure your candlestick data is properly aligned with the intended trading interval. It's a behind-the-scenes process that verifies the timestamps of the candles you've stored.

Essentially, it makes sure everything lines up correctly so your backtesting results are accurate. It directly reads data from the storage files, bypassing some intermediary layers. 

You'll provide a set of parameters to guide this check, telling it what to look for.

## Function addWalkerSchema

This function lets you add a new "walker" to the backtest-kit system. Think of walkers as specialized agents that run multiple strategy tests simultaneously and then compare their results.

You provide a configuration object, defining how this walker will operate – essentially setting up the rules for running those parallel strategy tests and analyzing their performance. This is a core step in setting up comparisons between different trading strategies.

## Function addStrategySchema

This function lets you tell the backtest-kit about a new trading strategy you've created. Think of it as registering your strategy so the system knows how to use it.

When you register a strategy this way, the system automatically checks it to make sure it's set up correctly - things like ensuring your price data and stop-loss/take-profit settings are valid. 

It also helps prevent a flood of signals and makes sure that even if something goes wrong during a live trade, your strategy's information is safely stored.

You pass in a configuration object that describes your strategy; this object contains all the details the framework needs to understand and execute your strategy.

## Function addSizingSchema

This function lets you tell the backtest kit how to determine the size of your trades. Think of it as setting up the rules for how much capital you'll allocate to each trade based on different factors. You provide a configuration object that outlines things like whether you want to use a fixed percentage, a Kelly Criterion, or an ATR-based sizing method. 

It also includes details on risk levels, position limits, and even allows for custom calculations if you need more control. Essentially, it's how you integrate your specific trade sizing strategy into the backtesting process.


## Function addRiskSchema

This function lets you tell the backtest-kit system about your risk management rules. Think of it as defining how much risk your trading strategies can take on together.

You can specify things like the maximum number of trades you'll allow at once, and even set up custom checks to ensure your portfolio remains healthy – considering things like correlations between different assets. 

It also allows you to define what happens to trading signals if they don't meet your risk criteria; perhaps you want to automatically reject them or allow them with a warning. 

Importantly, multiple trading strategies will share these risk rules, allowing the system to track overall portfolio risk and make decisions that consider all your active positions. This provides a central place for managing and enforcing your risk controls.


## Function addFrameSchema

This function lets you tell the backtest-kit about a new timeframe generator it should use. Think of it as registering a way to create the historical data, like daily, weekly, or even tick data, that your trading strategies will be tested against. 

You provide a configuration object that specifies things like the start and end dates of your backtest, the frequency of the data (daily, weekly, etc.), and a special function that gets called when new data chunks are ready. 

Essentially, it's how you set up the engine that feeds data to your backtesting process.

## Function addExchangeSchema

This function lets you tell the backtest-kit framework about a new exchange you want to use for your simulations. Think of it as registering a data source—it tells the system where to find historical price data and how to interpret that data. The exchange provides essential capabilities like fetching historical candle data, correctly formatting prices and quantities, and even calculating VWAP (volume-weighted average price) based on recent trading activity. You provide the framework with the exchange's configuration details when you call this function.

## Function addActionSchema

This function lets you tell the backtest-kit framework about a specific action you want to trigger during your backtesting process. Think of actions as ways to react to events happening during the simulation – maybe you want to log something to a file, send a notification, or update some external system.

You define what these actions are with an `actionSchema` object that tells the framework what kind of event should trigger it and what code to run.

These actions are tied to both the strategy and the frame of execution, so they’ll have access to all the data generated during a particular test run. This allows you to build very customized and reactive behaviors into your backtesting workflow.
