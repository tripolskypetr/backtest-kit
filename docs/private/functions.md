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

## Function validate

This function, `validate`, is a handy tool to double-check your backtest setup. It makes sure all the components you're using – like your exchanges, trading strategies, and risk management systems – are properly registered and ready to go.

You can tell it to validate specific parts of your setup by providing a list of what to check, or you can let it do a complete sweep of everything registered. 

It's a good idea to run this before you start any backtests or optimizations to catch potential errors early on and save you headaches later. The validation results are saved for quick access, which helps with performance.

## Function trailingStop

This function lets you fine-tune the trailing stop-loss for a trade that’s already set up. Think of it as adjusting how close your stop-loss can get to the current price. 

You specify the symbol you’re trading and then tell it how much to change the stop-loss distance – a positive number will bring the stop-loss closer, and a negative number will move it further away, all expressed as a percentage of the original distance. 

It automatically figures out whether it’s running a backtest or a live trade, so you don’t need to worry about that.


## Function stop

This function lets you halt a trading strategy’s activity. It essentially pauses the generation of new trading signals for a specific symbol. Any existing open signals will finish their process, but no new ones will be created. The system gracefully handles whether it's running a backtest or a live trading session, stopping at a convenient point like when it’s idle or a signal has completed. To use it, you simply provide the symbol of the trading pair you want to pause.

## Function setLogger

You can control how backtest-kit reports information during its runs by providing your own logger. This function lets you plug in a logger that adheres to the `ILogger` interface, allowing the framework to send its log messages through your chosen logging system. The framework will automatically include helpful details like the strategy name, exchange, and symbol in each log message, giving you more context. This is useful for integrating with existing logging infrastructure or for creating custom reporting mechanisms.

## Function setConfig

This function lets you adjust how backtest-kit operates by changing its core settings. You can modify things like the default data source or other global preferences. Think of it as tweaking the engine of the backtesting system.  If you're working in a test environment and need to bypass certain safety checks, there's a flag you can use to do so, but be careful when using that option.

## Function setColumns

This function lets you customize the columns displayed in your backtest reports, like those generated for markdown. You can tweak the definitions of existing columns or even add your own, giving you greater control over the information presented. The system will check your changes to ensure they are valid, but you can bypass this validation if needed, for example, when working within a testbed environment. Think of it as tailoring your reports to show exactly what you want to see.

## Function partialProfit

This function lets you automatically close a portion of your open trade when it's in profit, moving towards your target profit level. You specify the trading symbol and the percentage of the position you want to close. It handles whether you're running a backtest or a live trade automatically, so you don't need to worry about that. Essentially, it’s a tool to help manage your trades and lock in some profits along the way.


## Function partialLoss

This function lets you automatically close a portion of your open trade when the price is heading towards your stop-loss level. It’s designed to help manage risk by gradually exiting a position as it moves against you. You specify which trading pair you're dealing with and what percentage of your position you want to close, like 25% or 50%. The system handles whether it's running in a backtesting environment or a live trading situation, so you don't need to worry about that.


## Function listWalkers

This function lets you see a complete inventory of all the "walkers" currently set up in your backtest-kit environment. Think of walkers as custom data processors that analyze your trading data – this function gives you a peek at what those processors are. It returns a list describing each walker, which is helpful if you're trying to understand your system, build tools to manage it, or just troubleshoot something. Essentially, it's a way to check what's actively working behind the scenes.


## Function listStrategies

This function gives you a way to see all the trading strategies that are currently set up within your backtest-kit environment. Think of it as a quick inventory of your available strategies. It returns a list containing information about each strategy, letting you understand their configurations and properties. This is particularly handy when you're trying to figure out what strategies you've added, creating documentation, or building interfaces that need to know about your strategies.

## Function listSizings

This function lets you see all the sizing strategies currently set up in your backtest-kit environment. It’s like peeking under the hood to understand how your portfolio sizes different assets. You can use this to double-check your configurations, build tools that show your sizing rules, or generally get a better feel for how your trading system is organized. The result is a list of descriptions, each explaining a different sizing approach.

## Function listRisks

This function lets you see all the risk assessments your backtest kit is set up to handle. It gathers all the risk configurations you’ve previously defined using `addRisk()`. Think of it as a way to check what kind of potential problems your trading strategy is prepared to evaluate, helpful for troubleshooting or creating tools that need to understand these risks. It returns this information as a list, ready to be used in your code.

## Function listOptimizers

This function helps you discover all the optimization strategies your backtest-kit setup is using. It gives you a list of available optimizers, detailing their configurations. Think of it as a way to see what options are available for fine-tuning your trading models. It's handy for understanding your system's flexibility or for building tools that dynamically display optimizer choices. The function returns a promise that resolves to an array of optimizer schemas.

## Function listFrames

This function lets you see all the different types of data structures, or "frames," that backtest-kit knows how to handle. Think of it as a directory listing of the data formats it’s prepared to work with. It's really helpful if you’re trying to understand what data backtest-kit expects, or if you’re creating tools that need to interact with it programmatically.  The information it provides can be used to build tools that automatically adjust based on the registered frame types.


## Function listExchanges

This function lets you see a complete rundown of all the exchanges your backtest-kit setup knows about. Think of it as a directory listing for your trading venues. It's really helpful if you're trying to figure out what exchanges are available, double-checking your configuration, or creating tools that need to adapt to different exchanges. The result will be a list containing detailed information about each exchange.


## Function listenWalkerProgress

This function lets you keep track of how a backtest is progressing, especially when running multiple strategies. It essentially gives you updates after each strategy finishes its calculations within the backtest. The updates are delivered one at a time, even if the function you provide takes some time to process each update, ensuring a smooth and predictable flow of information. Think of it as a way to monitor the backtest’s journey step-by-step.

You provide a function that will be called with progress information, and this function returns another function that you can use to unsubscribe from those updates later.

## Function listenWalkerOnce

This function lets you watch for specific progress updates from a backtest or simulation, but only once a particular condition is met. You provide a filter – a test that determines which updates you’re interested in – and a function that will be executed when that condition is first satisfied. After your function runs, the listening automatically stops, which is handy if you just need to react to a single event and don't want to keep monitoring. Think of it as setting up a temporary alert for a specific change. 

It takes two things: a way to identify the updates you want (the filter) and the action you want to take when you see one (the callback function).


## Function listenWalkerComplete

This function lets you be notified when the backtest process finishes running all your trading strategies. It’s like setting up a listener that gets triggered when the entire testing cycle is done. Importantly, the notifications happen one at a time, even if the notification function itself takes some time to process, ensuring a smooth and predictable flow. You provide a function that will be executed when the backtest completes, and this function will return another function to unsubscribe from the listener when you no longer need it.

## Function listenWalker

This function lets you keep track of what's happening as your backtest runs. It's like setting up a listener that gets notified after each strategy finishes its part in the process. 

Think of it as getting updates on the progress of your backtesting, one strategy at a time.  The updates come in order, and even if the update itself takes some time to process (maybe you’re doing some calculations), it won’t interfere with the next update.  You just provide a function that will receive these updates, and the system handles the rest.  When you're done listening, you can unsubscribe using the function it returns.

## Function listenValidation

This function lets you keep an eye on any problems that pop up when the backtest-kit is checking for risks. Think of it as setting up an alert system—whenever a validation check fails and throws an error, this system will notify you. The errors are handled one at a time, ensuring things stay organized even if the notification process itself takes a little while. It’s a great way to catch and debug those unexpected validation issues.

You provide a function that will be called whenever an error occurs. This allows you to log the error, send a notification, or take any other action you deem necessary. When you're done needing this monitoring, the function returns another function that you can call to unsubscribe from these error notifications.

## Function listenSignalOnce

This function lets you set up a listener that only reacts to a specific type of trading signal once. Think of it as a temporary alert – you define what kind of signal you're waiting for, and when it arrives, your code runs, and then the listener disappears.  It's really handy when you need to react to a signal just once and then move on, like verifying a specific condition before proceeding with the rest of your backtesting strategy.  You provide a filter that determines which signals trigger the action, and then you provide a function that will execute when that signal is found. After the function runs, the listener automatically stops listening, so you don't have to worry about cleaning it up yourself.


## Function listenSignalLiveOnce

This function lets you temporarily listen for specific trading signals coming from a live backtest run. Think of it as setting up a short-term alert – you define a condition (using `filterFn`) and a function (`fn`) to execute when that condition is met. Once the condition is true and the function runs, the alert automatically turns off, so you don't have to worry about cleaning up your subscription. It's great for quickly observing or reacting to particular events during a live backtest, without needing to manage ongoing subscriptions.


## Function listenSignalLive

This function lets you tap into the live trading signals generated by backtest-kit, specifically when using `Live.run()`. It's a way to get real-time updates about what's happening during a simulated trade.

You provide a function that will be called whenever a new signal event occurs. This function receives data about the event, such as the strategy's tick result. 

Importantly, these signals are handled in the order they arrive, ensuring events are processed sequentially. The function returns an unsubscribe function, allowing you to stop listening for signals when you no longer need them.

## Function listenSignalBacktestOnce

This function lets you quickly react to specific signals generated during a backtest run. You provide a filter – a rule that determines which signals you're interested in – and a function to execute when a matching signal arrives. The function will only execute once when a matching signal is found and then automatically stops listening, so it's great for one-off tasks like logging a particular event or performing a brief calculation. It's designed to work specifically with signals coming from a `Backtest.run()` execution.

## Function listenSignalBacktest

This function lets you tap into the flow of a backtest and react to what's happening as it runs. It's like setting up a listener that gets notified whenever a signal is generated during the backtest process.  Importantly, the events you receive are handled one at a time, ensuring a consistent order. You provide a function that will be called with information about each signal event, allowing you to build custom logic around the backtest. When you’re done listening, the function returns another function that you can call to unsubscribe.


## Function listenSignal

This function lets you hook into the trading signals generated by backtest-kit. Whenever a new signal is produced – whether a position is opened, active, closed, or the strategy is idle – your provided function will be called. 

Crucially, these signals are handled in the order they arrive, and even if your function does something that takes time (like an asynchronous operation), backtest-kit ensures that signals are processed one at a time to keep things orderly. You give it a function to execute for each signal event, and it returns a function that you can use later to unsubscribe from those signals.

## Function listenRiskOnce

This function lets you react to specific risk rejection events just once and then automatically stops listening. Think of it as setting up a temporary alert – you specify a condition (using `filterFn`) and a function (`fn`) to run when that condition is met. Once the condition is met and the function executes, the listening stops, so you won't be bothered by further risk rejection events. This is handy if you need to perform an action based on a one-time occurrence of a risk rejection. 

It takes two main parts: a filter to identify the events you're interested in, and a function to run when a matching event occurs. The function then returns an unsubscribe function, which you could use if you want to manually stop the listener.

## Function listenRisk

This function lets you monitor for situations where trading signals are being blocked because they violate your risk rules. Think of it as a notification system specifically for when your risk checks fail. It’s designed to avoid unnecessary alerts – you only receive notifications when a signal is actually rejected due to a risk issue, not when it’s approved.

The alerts are handled one at a time, ensuring your callback function has a chance to process each rejection without interruption, even if it's a more complex, asynchronous process. It's a simple way to stay informed about potential risk-related problems in your trading strategy.

To use it, you provide a function that will be called whenever a signal is rejected for risk reasons. The function you provide will receive details about the rejected signal. This subscription can be cancelled by returning the value from the function call.

## Function listenPingOnce

This function lets you react to specific "ping" events happening within the backtest-kit system, but only once. You tell it what kind of ping event you're interested in using a filter – essentially a rule that the event must meet. Then, you provide a function that will be executed exactly one time when a matching ping event occurs. After that one execution, the listener automatically stops, cleaning up for you. Think of it as setting up a temporary alert that goes off just for a particular situation.


## Function listenPing

This function lets you keep an eye on the status of signals that are waiting to be activated. Think of it as a heartbeat signal – it sends a notification every minute while a signal is in this waiting period. You provide a function that will be called each time this "ping" event happens, allowing you to monitor the signal's lifecycle or implement your own custom checks during this time. Essentially, it's a way to be notified when a signal is patiently waiting for its turn to be put into action.



The function returns another function which you can call to unsubscribe from these ping events.

## Function listenPerformance

This function lets you keep an eye on how quickly your trading strategies are running. It's like setting up a listener that gets notified whenever the framework measures a performance detail during your strategy's execution. Think of it as a way to spot slow parts of your code and figure out how to make things faster. The information you receive is handled one at a time, even if the callback function you provide takes some time to process.

## Function listenPartialProfitOnce

This function lets you set up a listener that reacts to partial profit events, but only once. You provide a condition – a filter – that determines when the listener should trigger. Once that condition is met, it runs your provided callback function and then automatically stops listening. This is great for situations where you need to react to a specific profit level just one time and then move on. You essentially tell it "listen for this specific event, run this action once, and then forget about it."


## Function listenPartialProfit

This function lets you be notified whenever your trading strategy hits a certain profit milestone, like 10%, 20%, or 30% gain.  It makes sure these notifications happen one at a time, even if the code you provide to handle the notification takes some time to run. Think of it as a way to keep track of progress towards your profit goals within your backtesting or live trading environment.  You provide a function that will be called with information about the partial profit event, and this function returns another function you can use to unsubscribe from these notifications later.

## Function listenPartialLossOnce

This function lets you react to specific partial loss events in your trading system, but only once. You provide a filter that determines which events you're interested in, and a function to execute when a matching event occurs. After the function runs once, it automatically stops listening, making it perfect for situations where you need to respond to a condition just one time. Think of it as setting up a temporary alert for a particular loss scenario.


## Function listenPartialLoss

This function lets you be notified when your trading strategy experiences specific loss levels, like 10%, 20%, or 30% of its initial capital. You provide a function that will be called each time a loss milestone is hit. The important thing to know is that these notifications are handled in a controlled, sequential manner, even if your function needs to do some asynchronous work. This prevents any potential issues from callbacks running at the same time. To stop listening for these events, the function returns another function that you can call to unsubscribe.

## Function listenOptimizerProgress

This function lets you keep an eye on how your backtest kit optimizer is doing. It's like setting up a listener that gets notified as the optimizer works through its tasks. 

The listener will receive updates about the progress, and these updates are processed one at a time to make sure things run smoothly. You provide a function that will handle these progress updates, and the function returns another function that you can use to unsubscribe from these events when you're done. Think of it as a way to get real-time feedback on the optimizer's workflow.


## Function listenExit

The `listenExit` function lets you be notified when a critical error occurs that will halt the backtest-kit process, such as in background tasks. Think of it as a safety net for the most serious problems.  This isn't for minor issues – these are errors that bring everything to a stop.  The function makes sure your error handling code runs one step at a time, even if it's complex, to avoid further complications. You provide a function that will be called when such an error happens, and `listenExit` takes care of the rest.

## Function listenError

This function lets you set up a system to catch and deal with errors that happen during your trading strategy's run, but aren't severe enough to stop everything. Think of it as a safety net for things like temporary API connection problems. When a recoverable error occurs, this function will call your provided callback function. Importantly, errors are handled one at a time, in the order they happen, to keep things predictable, even if your error handling process takes some time. It ensures your error handling doesn't accidentally cause more problems. You provide a function to handle these errors, and this function returns another function that you can use to unsubscribe from listening for these errors later.

## Function listenDoneWalkerOnce

This function lets you react to when a background task within your backtest completes, but only once. You provide a filter to specify which completed tasks you're interested in, and a function to execute when a matching task finishes.  Crucially, it automatically stops listening after it has run once, preventing unnecessary callbacks. Think of it as a quick, single-use alert for specific background task completions. 

It takes two pieces of information: 

*   A filter – this tells it which events it should respond to.
*   A callback – this is the function that gets run when the filter matches an event. 

Once the filter matches, your callback runs and the subscription is automatically cancelled.

## Function listenDoneWalker

This function lets you monitor when background tasks within a Walker are finished. It provides a way to be notified when a Walker's background processing is complete, ensuring that any subsequent actions you take are performed in the correct order. The function takes a callback function as input, which will be executed when a background task is done. Importantly, it handles asynchronous callbacks safely, preventing multiple callbacks from running at the same time. You can think of it as a way to wait for and react to the completion of a chain of background processes.

## Function listenDoneLiveOnce

This function lets you react to when background tasks within your backtest finish, but only once. You provide a filter to specify which completed tasks you’re interested in, and a function to execute when a matching task finishes. After the callback runs once, it automatically stops listening, so you don't have to worry about managing subscriptions. It’s useful for tasks you only need to handle once upon completion. 

Essentially, it’s a quick way to get notified about a specific completed background process and then move on.


## Function listenDoneLive

This function lets you keep track of when background tasks within your backtest finish running. It's designed for situations where you need to know when a process is fully complete, even if the process itself involves asynchronous operations. You provide a function that will be called whenever a background task is done, and this function will be executed one at a time to prevent any conflicts. The order of completion events is maintained, so you'll always receive them in the same sequence they occurred.

## Function listenDoneBacktestOnce

This function lets you react to when a background backtest finishes, but in a special way: it only triggers once and then stops listening. You provide a filter – a way to check if the completed backtest is the one you’re interested in – and a function to run when the filter matches. Think of it as setting up a temporary alert that goes off just once for a specific backtest completion. Once that alert triggers, it's gone, so you don't need to worry about managing subscriptions.


## Function listenDoneBacktest

This function lets you be notified when a background backtest finishes running. It’s designed to handle completion events in a reliable way, ensuring they're processed one after another even if the notification involves asynchronous operations. Essentially, it provides a safe and orderly way to react to the end of a backtest. You provide a function that will be called when the backtest is done, and this function returns another function you can use to unsubscribe from these notifications later if needed.

## Function listenBreakevenOnce

This function lets you set up a listener that reacts to specific breakeven protection events, but only once. You provide a condition – a filter – to determine which events you’re interested in, and then a function to execute when that condition is met. After the function runs once, the listener automatically stops, so you don't need to worry about manually unsubscribing. It’s perfect for situations where you need to react to a breakeven condition just a single time.

The `filterFn` is your test – it decides whether an event is relevant. The `fn` is the action you want to take when a relevant event occurs.

## Function listenBreakeven

This function lets you keep an eye on when your trading signals automatically adjust their stop-loss to breakeven – essentially, back to your original entry price. This typically happens when a trade becomes profitable enough to cover the costs associated with setting it up. 

You provide a function that will be called whenever this breakeven adjustment occurs. Importantly, even if your function takes some time to complete (like if it involves some calculations), the system ensures that these breakeven events are handled one at a time, in the order they happen, so things don't get out of sync. The function you provide will return a function that can be called to unsubscribe from the event.

## Function listenBacktestProgress

This function lets you keep tabs on how a backtest is progressing. It allows you to register a function that will be called as the backtest runs, providing updates on its status. Importantly, these updates are delivered one at a time, even if the function you provide takes some time to process each update. This ensures that progress information is handled in a controlled and sequential manner, preventing any potential issues with simultaneous operations. You'll receive a callback function when you unsubscribe.

## Function hasTradeContext

This function simply tells you if you’re currently in a situation where you can safely interact with the trading environment. Think of it as a quick check to see if all the necessary pieces are in place for executing a trade. It confirms that both the execution and method contexts are active. If it returns `true`, you’re good to go and can use functions like getting historical candle data or formatting prices.

## Function getMode

This function simply tells you whether the backtest-kit framework is currently running a simulation (backtest mode) or a live trading session. It returns a promise that resolves to either "backtest" or "live", allowing your code to adapt its behavior based on the environment it's operating in. Think of it as a quick way to know if you're testing strategies or actually trading.

## Function getDefaultConfig

This function gives you a starting point for configuring your backtesting environment. It provides a set of predefined values for things like slippage percentages, retry attempts when fetching historical data, and limits on signal lifetime. Think of it as a template – you can look at these default settings to understand the available options and then customize them to suit your specific backtesting needs. It's a handy way to explore the framework’s configuration possibilities.

## Function getDefaultColumns

This function gives you a peek at the standard column setup used for generating reports within the backtest-kit framework. It provides a set of pre-defined column configurations for different data types like closed trades, heatmaps, live ticks, partial fills, breakeven events, performance metrics, risk events, scheduled events, walker signals, and strategy results. Think of it as a blueprint showing you the default structure of the columns that might appear in your reports, which you can then customize to fit your specific needs. It’s a handy resource for understanding the options you have when building your own report templates.

## Function getDate

This function, `getDate`, helps you find out what the current date is within your trading strategy. It's super useful for time-sensitive decisions. When you're running a backtest, it tells you the date associated with the specific historical timeframe you're analyzing. If you're running live, it gives you the actual current date.

## Function getConfig

This function lets you peek at the framework's global settings. It's like getting a snapshot of all the important numbers and flags that control how the system operates.  Crucially, it provides a copy of these settings, so you can look at them without accidentally changing the actual configuration. Think of it as a read-only view of the current setup.

## Function getColumns

This function gives you a snapshot of the column settings used when creating reports. It’s like peeking at the layout of your data tables before they’re generated. You’ll get lists of column configurations for different data views like closed trades, heatmaps, live ticks, partial fills, breakeven events, performance metrics, risk events, scheduled events, walker P&L, and strategy results. Importantly, it provides a copy, so any changes you make won't affect the actual report settings.

## Function getCandles

This function lets you retrieve historical price data, like open, high, low, and close prices, for a specific trading pair. You tell it which trading pair you're interested in (like BTCUSDT), how frequently the data should be grouped (every minute, 5 minutes, hourly, etc.), and how many data points you want to see. It pulls this information directly from the exchange you're connected to, going back in time from the present. Think of it as requesting a history log of prices to help you analyze past performance.

## Function getAveragePrice

This function helps you figure out the average price a security has traded at, using a method called Volume Weighted Average Price, or VWAP. It looks at the last five minutes of trading data to do this calculation. Specifically, it considers the high, low, and closing prices of each minute, along with the volume traded, to arrive at a weighted average. If there's no trading volume recorded, it simply calculates the average of the closing prices instead. You just need to provide the symbol of the asset you're interested in, like "BTCUSDT".

## Function formatQuantity

This function helps you prepare the right amount of a cryptocurrency or asset for a trade. It takes a symbol like "BTCUSDT" and a raw quantity as input, and then figures out how to format it correctly according to the rules of the specific exchange you're using. This ensures the quantity you send to the exchange is in the expected format, avoiding potential errors or rejected orders. Essentially, it takes care of the decimal places and any other exchange-specific formatting needs automatically.

## Function formatPrice

This function helps you display prices in a way that follows the rules of the specific exchange you're trading on. It takes a trading pair symbol, like "BTCUSDT", and the raw price value as input. Then, it figures out how many decimal places are needed based on that exchange's settings and returns the price formatted correctly as a string. Essentially, it handles the details of formatting so you don't have to worry about getting it right every time.

## Function dumpSignal

This function helps you save detailed records of your AI trading strategy's decisions. It takes the conversation history with the AI, the signal it generated (like entry price and stop-loss levels), and creates a nicely organized folder with markdown files.

Inside this folder, you'll find the initial instructions given to the AI, each user message, and the AI's final response, all neatly presented. 

This is super useful for debugging and understanding why your AI made a particular trading decision – you can easily review the entire process. The function won't overwrite existing files, so your previous analyses are safe. You can specify where these files are saved, or it will use a default location within your project.


## Function cancel

This function lets you cancel a pending signal that your strategy has scheduled. Think of it as removing a future action from the to-do list, without interrupting the strategy itself. It’s specifically for signals that are waiting for a certain condition (like the price opening) to activate. Importantly, cancelling a signal doesn't stop your strategy from running or generating new signals – it just removes the one you specify. You can optionally provide a cancellation ID to help you keep track of which cancellations were initiated by you. The function intelligently adapts to whether you're running a backtest or a live trading scenario.

## Function breakeven

This function helps manage your trades by automatically adjusting the stop-loss order. It essentially moves your stop-loss to the entry price once the trade has made enough profit to cover potential transaction costs and slippage. Think of it as a way to lock in profits and eliminate risk once a trade has moved favorably. The function figures out if it's running in a testing or live environment and automatically gets the current price to make the calculation. You only need to provide the trading pair symbol to use it.

## Function addWalker

This function lets you plug in a custom "walker" into the backtest-kit system. Think of a walker as a specialized engine that runs multiple trading strategies against the same dataset and then analyzes how they performed relative to each other. You provide a configuration object – the `walkerSchema` – which tells the walker how to execute those backtests and how to measure the results of the comparison. Essentially, it’s how you tailor the backtest-kit to evaluate strategies in a way that's specific to your needs.

## Function addStrategy

This function lets you tell backtest-kit about a new trading strategy you've built. Think of it as registering your strategy so the framework knows how to use it. When you register a strategy, the framework performs some checks to make sure everything is set up correctly, like validating the signals it produces and preventing it from sending too many signals at once. In live trading environments, it also ensures the strategy’s data is safely saved even if there are unexpected issues. You provide the framework with a configuration object that describes your strategy, and that's all it takes to add it to the system.

## Function addSizing

This function lets you tell backtest-kit how to determine the size of your trades. Think of it as setting up the rules for how much capital you’ll commit to each trade based on factors like risk tolerance and volatility. You provide a sizing schema, which outlines the specific method and parameters for calculating position sizes – whether it's a fixed percentage of your capital, a Kelly criterion approach, or something based on Average True Range (ATR).  You can also include constraints to limit position sizes and even define custom calculations using callbacks. By registering a sizing configuration, you’re essentially defining a core element of your trading strategy's risk management.

## Function addRisk

This function lets you set up the rules for how much risk your trading strategies can take on. Think of it as defining the guardrails for your entire trading system. You can specify limits on how many trades can be active at once and even create custom checks to ensure your portfolio isn't taking on too much risk, like monitoring correlations between assets.  Importantly, this risk management applies to all your strategies working together, offering a broader view of your overall exposure. The system keeps track of all open positions, which you can use in your custom risk validation functions.

## Function addOptimizer

This function lets you tell backtest-kit about a custom optimizer you've built. An optimizer is essentially a system that automatically creates and tests trading strategies. It gathers data, uses large language models (LLMs) to craft strategies, and then generates ready-to-run code – a complete `.mjs` file with all the necessary components like exchange settings and trading logic. Think of it as a factory for building and evaluating different trading approaches. You provide the optimizer's configuration through the `optimizerSchema` parameter.

## Function addFrame

This function starts the backtesting process, putting your strategies to work against the data you've provided. It takes optional configuration settings to control how the backtest runs. Once it's finished, it returns a promise that resolves to a result object containing all the key performance metrics and details about the backtest’s performance. Essentially, this is the command that actually runs the simulation and gives you the output you’re looking for.

## Function addExchange

This function lets you connect your trading framework to a specific exchange, like Coinbase or Binance. You provide a configuration object that describes how to access historical price data, how to format prices and quantities, and how to calculate key indicators like VWAP based on recent trading activity. Essentially, it's how you tell the backtest-kit where to get the data it needs to simulate trades. Think of it as plugging in a data source so the framework knows how to interpret the market information.
