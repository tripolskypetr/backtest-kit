---
title: docs/internals
group: docs
---

# backtest-kit api reference

![schema](../assets/uml.svg)

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

## Function setLogger

This function lets you customize how backtest-kit reports information. It allows you to plug in your own logging system, whether that's sending logs to a file, a database, or a third-party service.  The framework will automatically add helpful context to each log message, like the strategy's name, the exchange being used, and the trading symbol – making it much easier to understand what's happening during backtesting. To use it, you simply pass in an object that implements the `ILogger` interface.

## Function setConfig

This function lets you adjust how the backtest-kit framework operates by tweaking its global settings. You can modify things like the data handling, execution mode, or how orders are processed. It accepts a configuration object where you specify the settings you want to change; you don't need to provide every setting, just the ones you want to override.  There's an optional `_unsafe` flag—use it carefully, typically only in testing environments, as it bypasses important validation checks.

## Function listWalkers

This function gives you a peek under the hood, letting you see all the different "walkers" that are currently set up in your backtest kit. Think of walkers as the components that process your data and make decisions during a backtest. By calling this function, you’re getting a list describing what those walkers are. It’s a handy tool for understanding your trading system’s structure, especially when you're troubleshooting or building user interfaces that need to reflect the active walkers.

## Function listStrategies

This function gives you a way to see all the trading strategies that are currently set up and ready to use within the backtest-kit framework. It’s like getting a directory of all your available strategies, allowing you to see what's been registered. This is helpful for things like making sure your strategies loaded correctly, creating documentation, or dynamically building interfaces that show users the available options. The function returns a list of strategy schemas, which contains all the information defining each strategy.

## Function listSizings

This function lets you see all the sizing rules that are currently set up in your backtest. It gathers all the configurations you've added using `addSizing()` and presents them as a list. Think of it as a way to peek under the hood and understand how your trading system is determining order sizes. You can use this information to double-check your sizing logic or even build tools that automatically display these sizing configurations.


## Function listRisks

This function lets you see all the risk assessments your backtest kit is set up to handle. It essentially gives you a peek at the risk configurations that have been defined. Think of it as a way to check what kinds of risks your trading strategy is considering. You can use this to verify your setup, generate documentation, or even build interfaces that adapt to the risks being evaluated. It returns a list of risk schemas, giving you the details of each risk assessment.

## Function listOptimizers

This function lets you see all the different optimization strategies currently set up within your backtest environment. Think of it as a way to inventory your available optimizers – it provides a list of their configurations. You can use this to understand what options are available for fine-tuning your trading strategies, or to build tools that adapt to the optimizers you're using. It’s a handy tool for inspecting your setup and ensuring everything is working as expected.

## Function listFrames

This function gives you a simple way to see all the different data frames that your backtest kit is using. Think of it as a directory listing – it provides a list of all the registered frame schemas, which are essentially blueprints for how your data is organized. You can use this information to understand your data structure, help with troubleshooting, or even build user interfaces that adapt to the frames you've set up. It returns a promise that resolves to an array of these frame schemas.

## Function listExchanges

This function lets you see a list of all the exchanges that backtest-kit knows about. It's like getting a directory of available trading venues. You can use this to check if an exchange is set up correctly, generate a list for a user interface, or simply understand what options are available for your backtesting strategy. The function returns a promise that resolves to an array of exchange schema objects.

## Function listenWalkerProgress

This function lets you keep track of what’s happening as backtest-kit runs its simulations. It provides updates after each strategy finishes, so you can monitor the progress and potentially react to it. The updates are delivered one at a time, even if your monitoring code takes some time to process each one, ensuring things don’t get overwhelmed. This is useful for displaying progress bars, logging detailed information, or performing other actions based on the completion of each strategy within the backtest. You provide a function that will be called with information about each completed strategy. The function you provide will be automatically unsubscribed when you're done listening.

## Function listenWalkerOnce

This function lets you set up a listener that reacts to changes happening within a trading simulation, but only once a specific condition is met. You provide a filter that defines what kind of event you're interested in, and a function to execute when that event occurs. Once the event matches your filter and the callback runs, the listener automatically stops listening, ensuring it doesn’t interfere with other parts of your backtesting process. It’s a simple way to wait for a particular event to happen and then perform a specific action.

The `filterFn` determines which events trigger the action, and the `fn` is the action that gets performed when a matching event is detected.

## Function listenWalkerComplete

This function lets you be notified when a backtest run finishes. It's a way to get a signal that all the strategies have been tested. The notification comes in the form of an event containing the results of the backtest. Importantly, even if your notification process takes some time (like involving asynchronous operations), the framework ensures that notifications are handled one at a time, in the order they arrive, to avoid any unexpected issues. You provide a function that will be called with these results when the backtest is done. This function also returns a function that can unsubscribe from the event.

## Function listenWalker

This function lets you tap into the progress of a backtest run. It’s like setting up a listener that gets notified after each strategy finishes executing within the backtest. You provide a function (`fn`) that will be called with information about what just happened. Importantly, the function you provide will be executed one at a time, even if it's an asynchronous operation, ensuring a clean and orderly flow of information about the backtest’s progress. This lets you monitor and react to each strategy's completion without worrying about things getting out of sync.

## Function listenValidation

This function lets you keep an eye on any problems that pop up when your backtest kit is checking for risks. It's like setting up an alert system that tells you if something goes wrong during the risk validation process. Whenever an error occurs, the function you provide will be called, giving you a chance to log the error, display it to the user, or take other corrective actions. The errors are handled one at a time, even if your error handling function takes some time to complete.


## Function listenSignalOnce

This function lets you subscribe to specific trading signals and react to them just once. Think of it as setting up a temporary listener; it waits for a signal that meets your criteria, executes a function you provide when it finds one, and then automatically stops listening. It’s perfect for situations where you need to respond to a particular event only one time, like waiting for a specific market condition to trigger an action.

You specify the kind of signal you're waiting for using a filter function. This function determines whether a signal should trigger your callback. Then, you define the callback function that will be executed when the filter matches a signal. The subscription is automatically removed after the callback runs once.


## Function listenSignalLiveOnce

This function lets you temporarily listen for specific trading signals coming from a live backtest execution. Think of it as setting up a one-time alert – you define what kind of signal you're interested in (using the `filterFn`), and provide a function (`fn`) to handle that signal.  The function automatically takes care of unsubscribing after the single event is processed, so you don't have to worry about cleaning up your subscription. It’s useful when you need to react to a particular event during a live run and then stop listening.


## Function listenSignalLive

This function lets you hook into a live trading simulation and get notified whenever a signal is generated. Think of it as setting up an alert system for your trading strategy. It's specifically designed for use with `Live.run()` and ensures that these signal notifications are delivered one after another, in the order they happen. You provide a function – your callback – that will be called each time a new signal arrives, giving you the data from that signal event. The function returns another function that you can call to unsubscribe from these live signal updates.

## Function listenSignalBacktestOnce

This function lets you temporarily hook into the backtesting process to react to specific signals. Think of it as setting up a listener that only triggers once when a particular type of event happens during a backtest. You provide a filter to define which events you're interested in, and a function to execute when that filtered event occurs. Once the callback runs, the listener automatically disappears, ensuring it doesn't interfere with anything else. It's ideal for quickly inspecting or acting on certain signals without ongoing subscriptions.


## Function listenSignalBacktest

This function lets you tap into the backtest process and receive updates as it runs. Think of it as setting up a listener that gets notified whenever a signal is generated during a backtest. It's especially useful if you want to react to changes happening within the simulation in real-time, perhaps to display progress or perform calculations based on the trading signals. The signals are delivered one after another, ensuring you get them in the order they occurred. You provide a function that will be called with each signal, allowing you to do whatever you need with that information.

## Function listenSignal

This function lets you listen for signals from your backtesting strategy, like when a trade is opened, active, or closed. It’s like setting up a notification system to be informed about key events happening during your backtest. Importantly, it handles these events one at a time, even if your notification logic takes some time to complete – this ensures things stay in order and prevents unexpected issues. You simply provide a function that will be called whenever a relevant signal occurs, and this function receives information about the specific event.

## Function listenPerformance

This function lets you monitor how quickly your trading strategies are running. It provides a way to track the timing of different operations within your strategy's execution. Whenever a performance metric is recorded, this function will call your provided callback function. Importantly, it ensures that your callback is always executed one at a time, even if it involves asynchronous operations, ensuring a predictable and manageable flow of data. You can think of it as a listener that gives you insights into the performance of your trading logic, allowing you to pinpoint slow areas and optimize your code. It’s perfect for profiling and understanding where your strategy might be experiencing delays.


## Function listenPartialProfitOnce

This function lets you set up a listener that reacts to partial profit events, but only once. You provide a filter to specify exactly what kind of profit event you're interested in, and a function to execute when that event occurs. Once the matching event is found and your function runs, the listener automatically stops listening, making it perfect for situations where you need to react to something specific and then move on. Think of it as a temporary alert for a particular profit condition. 

The `filterFn` lets you define precisely which events trigger the action, and the `fn` is what actually happens when the filtered event is detected.


## Function listenPartialProfit

This function lets you keep track of your trading progress as you reach certain profit milestones, like 10%, 20%, or 30% gain. It’s designed to notify you when these levels are hit. The good news is, even if your notification process takes some time (like fetching extra data), the system ensures these notifications happen one after another, in the order they occur. Essentially, it gives you a reliable way to monitor your profitability step-by-step. You provide a function that will be called whenever a partial profit level is reached.

## Function listenPartialLossOnce

This function lets you react to specific partial loss events just once, and then automatically stops listening. Think of it as setting up a temporary alert – you define a condition (using `filterFn`) and a function (`fn`) to run when that condition is met. Once the condition is met and the function runs, the subscription is automatically removed, preventing further executions. It’s perfect when you need to respond to a particular loss scenario and then move on. You provide a function to identify the events you're interested in, and another function to handle those events.

## Function listenPartialLoss

This function lets you keep track of when your trading strategy experiences specific levels of losses, like 10%, 20%, or 30% declines. It essentially sets up a listener that will notify you whenever these milestones are reached. Importantly, it handles these notifications in a predictable order, even if your callback function needs to perform asynchronous operations. This ensures your code processes loss events sequentially, avoiding any unexpected behavior due to parallel execution. To use it, you simply provide a function that will be executed when a partial loss level is reached, and it returns a function to unsubscribe from these events when you no longer need them.

## Function listenOptimizerProgress

This function lets you keep track of how your backtest optimization is going. It provides updates during the optimization process, giving you insights into the data source processing steps. 

You provide a function that will be called whenever an update is available. The key thing to remember is that these updates are handled in the order they're received, even if your function takes some time to process each one. This ensures a predictable and reliable flow of information about your optimization run. 

Think of it as subscribing to a stream of progress reports, and this function manages that stream for you, handling the details of queuing and ordering the updates.

## Function listenExit

This function lets you be notified when something goes seriously wrong and stops the backtest-kit processes like background tasks. Think of it as an emergency alert system – it's for those errors that halt everything. Unlike the regular error listener, this one handles fatal problems that prevent further execution. The errors are handled in the order they happen, even if your response involves asynchronous operations. This ensures things are processed carefully and without conflicts. You provide a function that will be called with details about the error that occurred.

## Function listenError

This function lets you set up a listener for errors that happen while your trading strategy is running, but aren't critical enough to stop the whole process. Think of it as a safety net for things like temporary API problems. 

When an error occurs, the provided function will be called to handle it. The errors are processed one at a time, in the order they happen, even if your error handling code itself takes some time to complete. This ensures that errors are dealt with consistently and doesn't risk things getting out of sync. It's a reliable way to keep your strategy running smoothly despite minor setbacks.


## Function listenDoneWalkerOnce

This function lets you react to when a background task within a trading simulation finishes, but only once. You provide a filter to specify which completed tasks you're interested in, and then a function that will run when a matching task is done. Once that function has executed, the subscription automatically stops, so you don't need to worry about managing it yourself. Think of it as setting up a temporary alert for a specific type of completed background operation.

It's useful when you need to perform a single action after a particular background process finishes, and you don't want to keep listening for more events after that.


## Function listenDoneWalker

This function lets you monitor when a background task within the backtest-kit framework finishes running. Think of it as setting up a listener that gets notified when a process you started in the background finally concludes. The notification you receive includes information about the completed event. Importantly, even if your notification handling involves asynchronous operations, the notifications are processed one at a time, ensuring a reliable order of execution. It's a great way to keep track of the progress of longer running processes within your backtest.

## Function listenDoneLiveOnce

This function lets you react to when a background task finishes running, but only once. You provide a way to select which completed tasks you're interested in – essentially, a filter – and a function to run when a matching task finishes. Once that matching task completes, the function automatically stops listening, so you don't need to worry about manually unsubscribing. It's a convenient way to handle a single, specific completion event. 

You define what kind of completion event you're looking for using `filterFn` and then provide a function `fn` that will be called when that event occurs. After that single execution, the listener stops working.


## Function listenDoneLive

This function lets you keep track of when background tasks within the backtest-kit framework finish running. Think of it as a notification system – you provide a function, and it will be called whenever a background task completes. Importantly, these completion notifications are handled in the order they occur, and even if your function does something asynchronous (like making a network request), the framework makes sure things happen one at a time, preventing any conflicts. This provides a reliable way to respond to the finalization of these background operations.


## Function listenDoneBacktestOnce

This function lets you react to when a background backtest finishes, but only once. You provide a filter – a way to specify which backtest completions you’re interested in – and a function to run when a matching backtest is done. Once that function has run, the subscription is automatically removed, preventing it from triggering again. Think of it as a short-lived listener that gets triggered just for a specific completion event. 

It’s useful for situations where you need to perform an action immediately after a particular backtest concludes, and you don’t want to keep listening for other completions.


## Function listenDoneBacktest

This function lets you be notified when a backtest finishes running in the background. Think of it as setting up a listener that gets triggered when the backtest process is fully complete. Importantly, the notification will happen even if the backtest ran asynchronously, and the order of completions will be preserved. To ensure things don't get messy, any actions you take in response to the completion event will be processed one at a time.

You provide a function (`fn`) that will be executed once the backtest is done. This function receives a `DoneContract` object containing details about the completed backtest. The function you provide returns another function, which is a way to unsubscribe from the completion events when you no longer need to listen.

## Function listenBacktestProgress

This function lets you keep an eye on how your backtest is running. It’s like setting up a notification system that tells you about the progress as the backtest executes. The information you receive is sent sequentially, ensuring things happen in the order they were received, even if the information provided requires asynchronous processing. This helps you understand what’s happening behind the scenes and potentially adjust or monitor your strategy. You provide a function that will be called with updates about the backtest's progress.

## Function getMode

This function tells you whether the trading framework is running a backtest or operating in a live trading environment. It's a simple way to check the context of your code – for example, you might want to adjust logging levels or disable certain features during backtesting. It returns a promise that resolves to either "backtest" or "live", giving you a clear indication of the current operational mode.

## Function getDefaultConfig

This function gives you a handy starting point for setting up your backtest. It provides a pre-configured set of values for various settings within the framework, like retry counts for fetching data or minimum distances for take profit and stop loss orders. Think of it as a template – you can examine these defaults and then customize them to suit your specific trading strategy. It's a great way to understand all the configuration options available and what their standard settings are.

## Function getDate

This function, `getDate`, gives you the current date, and it adapts to how you're running your trading strategy. If you’re backtesting, it will return the date associated with the timeframe you're analyzing. However, if you're running the strategy live, it provides the actual current date and time. Essentially, it ensures your code always knows what date it's working with, whether it’s simulating past performance or reacting to the market in real-time.


## Function getConfig

This function lets you peek at the framework's global settings. It gives you a snapshot of the configuration values that control various aspects of the backtesting process. This copy ensures that any changes you make won't affect the actual running configuration – it’s a read-only view of how the system is set up. You can use it to understand things like how often prices are checked, retry attempts when fetching data, or limits on signal lifetimes.

## Function getCandles

This function helps you retrieve historical price data, or "candles," for a specific trading pair like BTCUSDT. You tell it which trading pair you're interested in, how frequently the data should be (like every minute, every hour, etc.), and how many candles you want to see. The function then pulls that data from the exchange you've set up within the backtest-kit framework. It's a straightforward way to get the historical price information needed for backtesting your trading strategies.

## Function getAveragePrice

This function helps you figure out the average price of a trading pair, like BTCUSDT. It calculates something called VWAP, which is a special kind of average that takes into account how much of the asset was traded at different prices. 

It looks at the last few minutes of trading activity – specifically, the highest, lowest, and closing prices – to determine this average.  If there's no trading volume recorded, it simply calculates the average of the closing prices instead. You just need to tell it which trading pair you're interested in.

## Function formatQuantity

The `formatQuantity` function helps you ensure the quantity you're using for trading is displayed correctly, following the specific rules of the exchange you're working with. It takes the trading pair symbol, like "BTCUSDT", and the raw quantity as input.  It then uses the exchange's own formatting logic to ensure the quantity has the correct number of decimal places, avoiding potential trading errors. Essentially, it's a convenient way to make sure your quantity values are presented in a way the exchange will understand.

## Function formatPrice

This function helps you display prices correctly for different trading pairs. It takes a symbol like "BTCUSDT" and the raw price value as input. The function then uses the specific formatting rules of the exchange to ensure the price is shown with the right number of decimal places, so it looks accurate and professional. Essentially, it handles the complexities of price formatting for you.

## Function dumpSignal

This function helps you save detailed records of your AI trading strategy's decisions. It takes the conversation between your AI and the LLM, along with the resulting trading signal, and organizes them into easy-to-read markdown files.

These files include the initial system prompt, each user message, and the final LLM output, all tied together with the signal data. This makes it simple to review what happened, troubleshoot issues, and understand how your AI arrived at its trading decisions.

The function creates a dedicated directory for each signal, using a unique identifier like a UUID. You can also specify a custom output directory, or it will default to a folder called "dump/strategy". To prevent accidental data loss, it won't overwrite any existing directories.

You'll provide a unique identifier (like a UUID) for each signal, the history of messages exchanged with the LLM, and the trading signal itself.

## Function addWalker

The `addWalker` function lets you register a "walker" within the backtest-kit framework. Think of a walker as a way to run multiple strategy backtests simultaneously using the same data, making it much easier to compare their performance against each other. You provide a configuration object, called a `walkerSchema`, which defines how the walker should execute the backtests and what metrics to use for comparison. This is useful for systematic strategy evaluation and optimization.

## Function addStrategy

This function lets you tell the backtest-kit framework about a new trading strategy you’ve created. Think of it as registering your strategy so the framework knows how to use it. When you add a strategy this way, the framework automatically checks to make sure it's set up correctly, including verifying the pricing, stop-loss/take-profit logic, and timestamps. It also helps prevent overwhelming the system with signals and ensures the strategy’s data can be safely saved even if something unexpected happens during live trading. You provide a configuration object, which defines all the details about your strategy.

## Function addSizing

This function lets you tell the backtest-kit how to determine the size of your trades. You provide a sizing schema, which is like a recipe that dictates things like how much of your capital to risk per trade, what method to use for calculating position size (fixed percentage, Kelly Criterion, or ATR-based), and any limitations you want to put on your positions. Think of it as setting the rules for how aggressively or conservatively your trades are sized. By registering this configuration, you’re essentially instructing the framework to use this recipe when calculating your position sizes during the backtest.

## Function addRisk

This function lets you set up how your trading framework manages risk. Think of it as defining the guardrails for your automated trading. You tell the framework things like how many trades can run at once and create custom checks to ensure your portfolio stays healthy – maybe checking correlations between assets or monitoring overall portfolio metrics. Importantly, this risk management applies across all your trading strategies, giving you a holistic view and control over potential issues. The framework keeps track of all active trades so your custom checks can access that information.

## Function addOptimizer

This function lets you add a custom optimizer to the backtest-kit framework. Think of an optimizer as a way to automatically create and refine trading strategies. It pulls data, uses LLMs to build conversation history and generate prompts, and then produces a complete, runnable JavaScript file that includes everything needed for backtesting – like your exchange setup, trading strategies, and how to analyze data across different timeframes. Basically, it automates a lot of the work of building a backtesting environment. You provide a configuration object that tells the framework how your optimizer works.

## Function addFrame

This function lets you tell backtest-kit how to generate the different timeframes you'll be using in your backtesting simulations. Think of it as registering a new way to create your data. You provide a configuration object, called `frameSchema`, that specifies things like the start and end dates for your backtest, the interval (e.g., 1-minute, 1-hour), and a function that will be called to actually create those timeframes.  Essentially, it’s how you define the structure and timing of the data your trading strategies will be analyzing.

## Function addExchange

This function lets you tell backtest-kit about a new data source for trading, like Coinbase or Binance. Think of it as registering a connection to a specific exchange. 

You provide a configuration object describing the exchange, which includes how to fetch historical price data and how to handle price and quantity formatting. The framework uses this information to access and interpret data from that exchange, and also uses it to calculate things like VWAP (Volume Weighted Average Price) based on recent price movements. This is essential for simulating trades and evaluating strategies.

# backtest-kit classes

## Class WalkerValidationService

The WalkerValidationService helps you keep track of and confirm your parameter sweep setups, often used for optimizing trading strategies or fine-tuning models. It acts like a central organizer, remembering all the different “walkers” (parameter sets) you've defined.

Before you run a parameter sweep, this service allows you to check if a particular walker configuration actually exists, preventing errors. It also remembers whether a walker is valid to speed things up – it caches the results so it doesn't have to re-validate every time.

You can register new walkers using `addWalker()`, and easily see all the registered walkers with `list()`. `validate()` makes sure the walkers you're using are properly set up, while the service itself remembers what it’s validated previously for efficiency.

## Class WalkerUtils

The WalkerUtils class simplifies working with walkers, providing convenient tools for running, stopping, and inspecting them. Think of it as a helper for managing your trading strategies.

It allows you to run comparisons for a specific trading symbol, automatically figuring out the necessary details from the walker's setup. You can also run these comparisons in the background, useful if you only need actions like logging or callbacks to happen without needing to see the comparison's progress.

If you need to halt a walker's signal generation, the `stop` function lets you do so, gracefully stopping the walker at a safe point.  It's designed to work even if multiple walkers are running on the same symbol.

You can retrieve the results of walker comparisons using `getData` and generate a detailed markdown report with `getReport`, and save this report to a file with `dump`.  Finally, `list` provides a way to see the status of all your active walker instances. The `_getInstance` property is a technical detail about how the system manages individual walker instances.

## Class WalkerSchemaService

The WalkerSchemaService helps you keep track of your trading strategy schemas in a safe and organized way. Think of it as a central place to store and manage the blueprints for your trading strategies. 

It uses a system for type-safe storage, ensuring that your schemas are consistent and reliable. You can add new strategy blueprints using `addWalker()` and then retrieve them later using their names. 

Before adding a new blueprint, the service checks to make sure it has all the necessary components with the correct types. You can also update existing blueprints with just the parts that need changing. If you need to find a specific strategy's blueprint, simply ask for it by name.

## Class WalkerMarkdownService

This service helps you create reports about your trading strategies, specifically when you're backtesting them. It listens for updates from your backtesting process (the "walker") and collects data about how each strategy is performing.

The service automatically organizes this data and turns it into easy-to-read markdown tables, comparing your strategies side-by-side.  These reports are then saved as files, making it simple to review and analyze your results.

Each backtesting run ("walker") gets its own dedicated storage for results, ensuring data stays separate and organized. You can choose to clear the accumulated data for a specific walker or clear everything at once. The service handles creating the necessary directory structure for the reports as well. It sets itself up automatically when needed, so you don’t have to worry about manual initialization.

## Class WalkerLogicPublicService

This service helps orchestrate and manage the execution of automated trading strategies, often called "walkers." It builds upon a private service to handle the core logic and adds a layer of convenience by automatically passing along important information like the strategy name, exchange, and frame details.

Think of it as a helper that streamlines the process of running backtests, ensuring that all the necessary context is readily available.

The `run` method is your main tool: it takes a trading symbol and context information, then executes backtests for all strategies, automatically handling the context propagation for you.

## Class WalkerLogicPrivateService

This service helps you compare different trading strategies against each other in a structured way, like a competition. It manages the execution of each strategy, keeping track of their progress and performance as they run. 

Think of it as a conductor, coordinating the backtesting of multiple strategies for a single asset.  As each strategy finishes its backtest, you'll receive updates about its results. The service also monitors which strategy is performing best throughout the entire process. 

Finally, it provides you with a complete ranking of all strategies, showing you which ones performed the best based on the chosen metric.  It relies on other services internally to handle the actual backtesting and formatting of results.


## Class WalkerCommandService

WalkerCommandService acts as a central hub for accessing the core functionality of the backtest-kit system. Think of it as a convenient way to get things done within the framework, particularly when you need dependency injection. 

It bundles together several essential services, including those responsible for logging, handling walker logic, validating strategies, exchanges, frames, and risks. These services work together to ensure everything operates correctly and consistently. 

The most important method available through this service is `run`.  This lets you trigger a walker comparison, meaning it will execute a specific trading strategy or approach against historical data. You provide a symbol (like a stock ticker) and context information—such as the names of the walker, exchange, and frame—to guide the comparison. The `run` method returns an asynchronous generator, allowing you to process the results as they become available.

## Class StrategyValidationService

This service helps keep track of your trading strategies and makes sure they're set up correctly before you start trading. It acts like a central registry where you can add your strategy configurations. 

You can register new strategies using `addStrategy`, giving the service the name and details of your strategy. Before you run anything, you can use `validate` to double-check that a strategy exists and that its associated risk profile is also valid.  If you just want to see what strategies you've registered, `list` will give you a complete list. The service is designed to be efficient, remembering past validation results so it doesn't have to repeat checks unnecessarily.

## Class StrategySchemaService

The StrategySchemaService helps you keep track of your trading strategies and their configurations in a structured and type-safe way. Think of it as a central place to define and manage how your strategies are set up.

You can add new strategy definitions using `addStrategy()` and then find them again later by their name using `get()`. The service also includes built-in checks to make sure your strategy definitions are correctly formatted before they’re stored, thanks to the `validateShallow` function.

If you need to make small changes to an existing strategy definition, the `override` function lets you update specific parts without having to redefine the entire strategy. The whole process is designed to make sure your strategy configurations are consistent and well-organized.

## Class StrategyCoreService

StrategyCoreService acts as a central hub for managing and interacting with trading strategies within the backtest kit. It combines different services to ensure strategies have the necessary information about the symbol, time, and backtest settings.

This service handles tasks like validating strategies, retrieving pending signals, checking if a strategy is stopped, and running backtests. It keeps track of previously validated strategies to avoid unnecessary repetition, which helps improve performance.

You can use it to check the status of a strategy, run quick backtests on historical data, or stop a strategy from generating new signals. It also provides a way to clear the cached version of a strategy, forcing it to reload and reinitialize. It's the workhorse for orchestrating strategy operations.

## Class StrategyConnectionService

The StrategyConnectionService acts as a central hub, directing requests to the correct trading strategy based on the symbol and strategy name you're using. It intelligently manages these strategies, keeping them ready for use and avoiding unnecessary re-initialization thanks to a caching system. 

Think of it as a smart dispatcher that ensures your live trades and backtests are routed to the right place. It also provides methods to check the status of a strategy, retrieve pending signals, and stop a strategy's operation. You can even clear the cached strategy, effectively forcing a fresh start. This service handles both real-time trading (tick) and historical data analysis (backtest) by ensuring the strategy is properly set up before any work begins.

## Class SizingValidationService

The SizingValidationService helps you keep track of and confirm your position sizing setups. Think of it as a central hub for managing your sizing strategies. 

You can register new sizing approaches using `addSizing()`, and `validate()` lets you double-check that a specific sizing strategy is actually registered before you try to use it.  To make things efficient, the service remembers its validation results, so it doesn't have to re-check things repeatedly.  Finally, `list()` allows you to see a complete overview of all the sizing strategies you’re currently using.

## Class SizingSchemaService

The SizingSchemaService helps you keep track of your sizing schemas in a structured and type-safe way. It acts as a central place to store and manage these schemas, making sure they all have the necessary components.

Think of it like a library for your sizing rules – you can add new rules using `register`, update existing ones with `override`, and easily find the rules you need by name using `get`.  It uses a specialized registry system to ensure the schemas are well-formed and consistent, and performs a quick check when you add a new schema to make sure it looks right. The service also has an internal logger to help track what's happening.

## Class SizingGlobalService

The SizingGlobalService helps determine how much to trade in each operation. It acts as a central point, coordinating calculations based on your risk parameters and other factors.

Think of it as a helper that sits between the core strategy logic and the systems that handle position sizing. It uses a connection service to actually perform the size calculations and another service to make sure the sizing is valid. 

The `calculate` method is the main way to use this service; it takes parameters defining the desired risk and returns the calculated position size. It’s designed for internal use within the backtest-kit framework, but provides a reliable way to handle sizing operations.


## Class SizingConnectionService

The SizingConnectionService helps connect your trading strategy to the right sizing logic. It's like a traffic controller, ensuring that sizing calculations, like determining how much to trade, are directed to the specific sizing method you’ve configured. 

It uses a clever caching system – memoization – to avoid repeatedly creating those sizing instances, making things faster and more efficient. You specify which sizing method to use through a name, and the service handles the rest. 

If you don't have a custom sizing method set up, the sizing name will be empty. The `calculate` function then uses this name to call the correct sizing method, considering your risk parameters and the trading context. This makes it easy to incorporate various sizing approaches into your backtesting framework.

## Class ScheduleUtils

ScheduleUtils helps you keep track of and understand your scheduled trading signals. It’s designed to be a central place to monitor how your strategies are performing over time. 

Think of it as a tool for getting a clear picture of your scheduled signals – whether they’re being sent as planned, if any are being cancelled, and generally how long they’re waiting. 

You can easily retrieve data about specific trading symbols and strategies to see how they’re behaving.  It can also create nicely formatted markdown reports to help you visualize the data. Finally, it can save these reports directly to your computer for later review. It's made available as a single, readily accessible instance, making it simple to use within your backtesting framework.

## Class ScheduleMarkdownService

This service helps you track and analyze your scheduled trading signals. It listens for when signals are scheduled and cancelled, keeping a record of these events for each strategy you're using. You can then generate nicely formatted markdown reports detailing these events, including useful statistics like cancellation rates and average wait times. These reports are saved automatically to a log file, making it easy to review your trading activity.

The service is designed to be self-sufficient – it automatically initializes itself when needed and keeps data separate for each combination of trading symbol and strategy. It offers functions to get the accumulated data, create these markdown reports, save them to disk, and clear the collected information if needed.

## Class RiskValidationService

This service helps keep track of your risk management settings and ensures they're set up correctly before your trading strategies run. Think of it as a central place to register and verify your risk profiles – the rules you set for how much risk your strategies can take.

You can add new risk profiles using `addRisk`, and it's a good idea to use `validate` to double-check that a profile exists before your strategies try to use it. The service remembers validation results, so it doesn't have to repeat checks unnecessarily, making things faster.  If you need to see all the registered risk profiles, you can use `list` to get a complete overview. It also has a `loggerService` for keeping an eye on what's happening and an internal map `_riskMap` to store the risk schemas.

## Class RiskSchemaService

This service acts as a central place to store and manage different risk profiles, ensuring they are consistently structured and easily accessible. It uses a special type-safe storage system to keep track of these profiles.

You can add new risk profiles using `addRisk()`, and retrieve existing ones by their assigned names using `get()`. If you need to make small changes to a profile that already exists, you can use `override()` to update it. Before adding a new risk profile, `validateShallow()` checks to make sure it has all the necessary parts and is set up correctly. The service also keeps a log of what's happening for troubleshooting.

## Class RiskGlobalService

This service acts as a central point for managing and validating risk limits within the backtest-kit framework. It works hand-in-hand with the connection to your risk management system, making sure trades adhere to predefined rules. 

The service keeps track of open and closed trading signals, communicating this information to the risk management system. It's designed to be efficient, remembering previous risk validations to avoid unnecessary checks. 

You can clear the service's memory of risk data completely, or just for a specific "risk instance" if you’re working with multiple risk configurations. Essentially, it provides a layer of abstraction and control over your risk management processes.

## Class RiskConnectionService

The RiskConnectionService acts as a central hub for managing risk checks within your backtesting system. It ensures that risk operations are directed to the correct risk implementation based on a specified name. To improve performance, it remembers previously used risk implementations, so you don't have to create them repeatedly. 

You can retrieve a specific risk implementation using `getRisk`, which creates one if it doesn't already exist and then saves it for later use. The `checkSignal` function evaluates if a trade should be allowed, considering various risk limits like drawdown and exposure. Signals are registered and removed using `addSignal` and `removeSignal` respectively, also routing them to the correct risk implementation. Finally, `clear` provides a way to clear the cached risk implementations when needed. Strategies without defined risk configurations will simply use an empty string for the risk name.

## Class PositionSizeUtils

This class provides helpful tools for figuring out how much of an asset to trade in your backtests. It offers several pre-built methods for calculating position sizes, like using a fixed percentage of your account, applying the Kelly Criterion, or basing the size on the Average True Range (ATR). 

Each method has its own formula and takes different inputs – things like your account balance, the asset's price, and win/loss ratios. The methods also include checks to make sure you're providing the right information for each sizing approach. Think of it as a toolbox for determining appropriate trade sizes within your backtesting strategy.

## Class PersistSignalUtils

This class, PersistSignalUtils, helps manage how trading signals are saved and retrieved, especially for strategies running in live mode. It makes sure that signal data is reliably stored and restored, even if the system crashes.

It uses a clever system of memoization, meaning it remembers where to find signal data for each strategy, avoiding unnecessary lookups. You can even customize how the data is stored by registering your own persistence adapter.

When a strategy needs to load its saved state, `readSignalData` fetches the signal information. Conversely, `writeSignalData` securely saves the signal data, ensuring that changes are written atomically, preventing data corruption. 




Essentially, it provides a safe and efficient way to keep track of a strategy's signal state over time.

## Class PersistScheduleUtils

This utility class, PersistScheduleUtils, helps manage how scheduled signals are saved and restored for your trading strategies. Think of it as a safeguard ensuring your strategy’s planned actions aren't lost, even if something unexpected happens.

It automatically handles saving and loading scheduled signals for each strategy, making the process easier and safer. You can even customize how the data is stored using a persistence adapter, offering flexibility.

When a strategy is initialized, `readScheduleData` retrieves any previously saved signal information. Conversely, `writeScheduleData` safely saves the current state of scheduled signals to disk using a technique that prevents data corruption. The overall goal is to create a reliable system for keeping track of these signals.


## Class PersistRiskUtils

This utility class, PersistRiskUtils, helps manage how your trading positions are saved and restored, particularly when dealing with different risk profiles. It remembers storage instances to avoid unnecessary work and lets you plug in your own methods for saving data. 

The class ensures that when your system restarts, your active positions are brought back correctly. It handles saving the data reliably, even if unexpected things happen during the save process, preventing data loss. 

You can customize how data is saved by registering your own persistence adapter. The `readPositionData` function retrieves saved position information for a specific risk profile, and `writePositionData` saves the data back to disk in a way that's safe from corruption.

## Class PersistPartialUtils

This class, PersistPartialUtils, helps manage how your trading system remembers partial profit/loss levels, especially when things go wrong. It's designed to ensure your system recovers gracefully even if it crashes.

It keeps track of partial data separately for each trading symbol, and provides a way to use your own custom storage methods if the default isn't quite what you need. 

When your system starts up, it uses `readPartialData` to load any previously saved profit/loss information.  After changes are made, `writePartialData` reliably saves those changes to disk, making sure the data isn’t lost even if there’s a crash. The `usePersistPartialAdapter` method allows you to plug in alternative storage solutions. 






## Class PerformanceMarkdownService

This service helps you understand how your trading strategies are performing. It gathers data about your strategies as they run and organizes it so you can see the results clearly. 

You're able to track performance metrics, like average returns, maximum drawdowns, and percentiles, for each strategy you use. The service provides functions to retrieve this data and generate easy-to-read markdown reports which highlight potential areas of improvement. These reports are automatically saved to your logs.

The service makes sure initialization only happens once and uses a logger to keep you informed. It creates separate data storage for each combination of symbol and strategy, ensuring your metrics stay organized. You can also clear out all accumulated performance data when needed.

## Class Performance

The Performance class helps you understand how well your trading strategies are performing. It provides tools to collect and analyze performance data, identify bottlenecks, and generate easy-to-read reports. 

You can retrieve detailed performance statistics for a specific trading symbol and strategy, giving you a breakdown of metrics like duration, average execution time, and volatility. 

The class also lets you create markdown reports that visualize the performance data, highlighting potential areas for optimization. Finally, you can easily save these reports to disk for later review or sharing.

## Class PartialUtils

The PartialUtils class is your go-to for understanding and reporting on partial profit and loss events within your backtesting or trading system. Think of it as a helper to analyze how your strategies are performing on a smaller, more granular level before you see the overall results.

It gathers data from events like profits and losses, keeping track of details such as the symbol traded, the strategy used, the signal ID, position size, level, price, and when the event happened.

You can ask it for statistical summaries of these partial events for a specific symbol and strategy.  It can also create nicely formatted markdown reports, which include a table of all the partial profit/loss events along with a summary at the bottom.  Finally, it allows you to save these markdown reports directly to a file on your disk for later review – the file name will include the symbol and strategy name, making it easy to organize. It works by pulling data from the PartialMarkdownService, which itself stores this information.

## Class PartialMarkdownService

The PartialMarkdownService helps you keep track of your trading performance by automatically creating reports on partial profits and losses. It listens for these events and organizes them by symbol and strategy. 

It creates detailed markdown tables summarizing each event, and also provides overall statistics. These reports are then saved as files on your disk, making it easy to review your trading activity. 

The service manages its data using isolated storage for each symbol and strategy combination. You can generate reports, save them to files, or clear the accumulated data as needed. Importantly, the service initializes automatically when you start using it, so you don’t need to set it up manually.

## Class PartialGlobalService

The PartialGlobalService acts as a central hub for managing partial profit and loss tracking within your trading strategies. It’s designed to be injected into your strategies, simplifying how they interact with the underlying connection layer. Think of it as a layer of abstraction, allowing you to monitor and control partial operations globally.

It’s responsible for logging important events – like reaching profit or loss levels, or clearing a signal – before passing those actions on to the PartialConnectionService for the actual processing. This central logging provides a valuable tool for monitoring your strategies' performance.

The service relies on several other services injected from a dependency injection container to perform its tasks, including validation and schema retrieval. You don’t typically need to interact with these services directly; the PartialGlobalService handles them internally. You're primarily interacting with the `profit`, `loss`, and `clear` methods to manage partial state changes.

## Class PartialConnectionService

The PartialConnectionService is like a central manager for tracking profit and loss for individual trading signals. It keeps track of these signals, ensuring each one has its own dedicated record.

Think of it as a factory that creates and manages these individual records, which are called ClientPartial instances. It cleverly remembers these records so it doesn’t have to recreate them every time, speeding things up.

When a signal makes a profit or suffers a loss, the service handles the calculation and sends out notifications. If a signal closes completely, this service cleans up its records, making sure everything is tidy. It works closely with other parts of the system to keep track of trading performance in a controlled and efficient way.

## Class OutlineMarkdownService

This service helps generate markdown documentation for your backtesting experiments, particularly useful when you're using AI to optimize your strategies. It automatically creates a folder structure to neatly organize system prompts, user messages, and the final LLM output related to each trading signal. 

The service relies on a logger to handle the writing process and has a key function, `dumpSignal`, that takes the signal ID, conversation history, and trading signal data to create these markdown files. Importantly, it checks to see if a directory already exists before creating new files, so you don't accidentally overwrite previous results. This makes debugging and reviewing your AI-powered trading strategies much easier.

## Class OptimizerValidationService

This service helps keep track of your optimizers, ensuring they're properly registered and available for backtesting. Think of it as a central registry for all your optimizers. 

You can use it to add new optimizers, and it will prevent you from accidentally registering the same optimizer twice. It also provides a quick way to check if an optimizer exists and will remember previous validation checks for speed.

If you need to see all the optimizers you've registered, it offers a simple way to list them. It keeps things organized and efficient, especially when you're dealing with many different optimizers in your backtesting framework.

## Class OptimizerUtils

This section provides helpful tools for working with your trading strategies, particularly when you're using an optimizer. You can use these tools to retrieve information about your strategies, generate the actual code that will run them, and save that code to files for easy deployment. 

The `getData` function lets you pull data and build up the information needed for your strategies. `getCode` generates the complete, runnable code for your strategies, including all necessary parts like imports and helper functions. Finally, `dump` allows you to generate the strategy code and automatically save it to a file, even creating the necessary folders if they don't already exist – making it a quick way to get your strategies ready to run.

## Class OptimizerTemplateService

This service is designed to create the building blocks of your automated trading strategies using a large language model (LLM). It handles a lot of the repetitive coding tasks, letting you focus on the core strategy logic.

It's particularly good for comparing different trading approaches (Walker-based comparison) and incorporating multi-timeframe analysis to generate trading signals. The signals are structured as JSON, including details like entry/exit prices, stop-loss levels, and estimated duration.

You can customize certain aspects of this service through configuration, but it provides a solid default setup that leverages the Ollama LLM for tasks like generating code snippets, structuring prompts, and producing formatted output. It also includes debugging tools to help track and analyze the process, saving conversations and results to a designated directory.

It generates code for several key components:

*   **Exchange Configuration:** Sets up connections to cryptocurrency exchanges (using CCXT Binance).
*   **Timeframe (Frame) Configuration:** Defines the historical data windows for analysis.
*   **Trading Strategy Configuration:**  Creates the core logic for generating trading signals.
*   **Walker Configuration:** Enables comparisons of different strategies.
*   **Launch Code:**  Initiates the execution of the configured system.



The service also provides helper functions for text and JSON output, utilizing a specific Ollama model for enhanced market understanding and structured signal generation.

## Class OptimizerSchemaService

This service helps you keep track of and manage the configurations for your optimizers within the backtest-kit framework. Think of it as a central place to define and access optimizer settings. 

It ensures your optimizer configurations are valid by checking for essential details like the optimizer's name, the training range, where the data comes from, and how to generate prompts. You can register new optimizer configurations, update existing ones by selectively changing parts of them, and retrieve configurations by name when you need them. 

Behind the scenes, it uses a special registry to store these configurations in a safe, unchangeable way.

## Class OptimizerGlobalService

This service acts as a central point for interacting with optimizers, making sure everything is working correctly before passing requests on. It keeps track of what's happening and verifies that the optimizer you're trying to use actually exists.

You can use this service to retrieve data associated with an optimizer, get the complete code for a trading strategy based on an optimizer, or even save that code directly to a file. Think of it as a gatekeeper ensuring safe and valid interactions with your optimizers. 

Here's a quick rundown of what it offers:

*   **Data Retrieval:**  Gets information about your optimizers.
*   **Code Generation:** Creates the actual trading strategy code you’ll use.
*   **File Saving:**  Automatically saves the generated code to a file for easy use.

## Class OptimizerConnectionService

The OptimizerConnectionService helps you work with optimizers in a clean and efficient way. It manages optimizer connections, making sure you don't create unnecessary instances and keeping things performant through caching.

Think of it as a central hub for getting optimizers ready to use – it handles combining custom settings with default settings, and allows you to inject logging.

You can request an optimizer instance using `getOptimizer`, which will either return a cached instance or create a new one based on its name.

The service also provides methods to retrieve strategy data (`getData`) and generate the final code needed to execute those strategies (`getCode`). Finally, you can save the generated code directly to a file using `dump`.

## Class LoggerService

The LoggerService helps you keep your backtesting logs organized and informative. It's designed to add extra details to your log messages automatically, so you don't have to manually add things like which strategy or exchange is running.

You can customize the logging behavior by providing your own logger implementation through the `setLogger` method. If you don't provide a logger, it will use a default "no-op" logger that doesn't actually log anything.

The service includes several methods for different log levels: `log`, `debug`, `info`, and `warn`. These methods each add context automatically, making it easier to trace what’s happening during your backtests. 

Internally, it utilizes method and execution context services to enrich the log messages.

## Class LiveUtils

LiveUtils helps you run live trading operations with some helpful additions. It's designed to be easily accessible and provides a single, consistent way to start and manage your live trading processes.

The `run` function is the core – it kicks off live trading for a specific symbol and strategy, and it's built to be resilient. If something goes wrong and the process crashes, it can recover its state from disk. It produces a continuous stream of trading results as an async generator.

Want to run a live trade silently in the background, perhaps just to send data to a callback or save it somewhere? The `background` function is for you - it handles all the trading internally without you needing to deal with the results.

Need to stop a strategy from generating new trading signals? The `stop` function does just that. Existing trades will finish normally, but no new signals will be created.

You can also monitor what's happening with `getData` to get performance statistics, `getReport` to generate a detailed markdown report of the trading activity, and `dump` to save that report to a file. Lastly, `list` lets you see a quick overview of all your active live trading instances and their status.

## Class LiveMarkdownService

This service helps you automatically create and save detailed reports about your trading strategies. It listens to all the trading events – like when a strategy is idle, opens a position, is active, or closes a position – and carefully tracks them. 

The service organizes this information per strategy and symbol, presenting it in easy-to-read markdown tables. It also calculates important trading statistics such as win rate and average profit/loss. The reports are saved as markdown files in a dedicated logs folder, making it simple to review your strategy's performance.

To get started, the service needs to be initialized which happens automatically when it’s first used. It uses a special storage mechanism to keep data separate for each strategy and symbol combination. You can also clear the accumulated data if you need to, either for a specific strategy or for all strategies. Finally, the `dump` method lets you save the report to disk, creating any necessary directories along the way.

## Class LiveLogicPublicService

This service helps manage live trading, handling the complexities behind the scenes. Think of it as a conductor orchestrating the trading process, automatically passing along important details like the strategy and exchange being used.

It runs continuously, generating a stream of trading signals (both opening and closing) as it goes. This ongoing stream allows for real-time monitoring and execution. 

The system is designed to be robust – if something goes wrong and the process crashes, it can automatically recover and pick up where it left off thanks to saved state. You don't have to worry about losing progress. 

To start trading, you simply provide the symbol you want to trade, and the service takes care of the rest, seamlessly integrating with the underlying framework and ensuring everything runs smoothly.

## Class LiveLogicPrivateService

This service helps orchestrate live trading using a continuous, never-ending process. It constantly monitors a trading symbol and provides updates as they happen. Think of it as a live feed of trading events, specifically when positions are opened or closed.

The service is designed to be resilient; if something goes wrong, it can recover and continue trading from where it left off. It efficiently streams the results to avoid memory issues.

To start trading, you simply tell it which symbol you want to monitor, and it will provide a continuous stream of opened and closed trading signals. It's a streamlined way to keep track of what’s happening in your live trading environment.


## Class LiveCommandService

This service acts as a central hub for handling live trading operations within the backtest-kit framework. Think of it as a convenient way to access various services needed for live trading, making it easy to inject dependencies and keep your code organized.

It offers a single `run` method, which is the primary way to initiate live trading. This method continuously streams results, such as opened and closed trade notifications, for a specific trading symbol.  It's designed to be robust, automatically recovering from potential errors to ensure continuous operation. You provide the symbol to trade and some context about the strategy and exchange being used. 

Behind the scenes, it relies on other services like `liveLogicPublicService`, and validation services to ensure everything is running correctly.

## Class HeatUtils

HeatUtils helps you visualize and understand the performance of your trading strategies using heatmaps. It’s like having a handy tool to quickly see how each symbol contributed to a strategy’s overall results. 

You can easily get the raw data for a strategy’s heatmap, which includes things like total profit/loss, Sharpe ratio, and maximum drawdown for each symbol.  It also generates a nicely formatted markdown report, which is essentially a table summarizing the key metrics for each symbol and the overall portfolio.

Finally, HeatUtils allows you to save these reports to a file on your computer, so you can review them later or share them with others. This is particularly useful for tracking a large number of strategies and symbols. The tool automatically handles creating the necessary folders to store your reports.


## Class HeatMarkdownService

The Heatmap Service helps you visualize and analyze your trading performance across different strategies. It gathers data about closed trades, calculating important metrics like total profit/loss, Sharpe Ratio, and maximum drawdown for each symbol and across your entire portfolio. 

Think of it as a central hub for understanding how your strategies are doing. It provides detailed breakdowns per symbol and also aggregates the data to give you a broader view. 

You can request the statistics data directly, or generate a nicely formatted markdown report to easily share or review. The service handles edge cases in calculations to avoid unexpected results. It also keeps track of individual strategies in separate storage areas, allowing for easy navigation and clearing. The initialization process happens automatically when you first start using it, so you don't have to worry about setting things up.

## Class FrameValidationService

This service helps you keep track of your trading timeframes and make sure they're set up correctly. Think of it as a central hub for your frame configurations.

You can add new timeframes using `addFrame`, giving each one a name and a schema to define its structure. Before you start trading or analyzing data, use `validate` to confirm that the timeframe you need actually exists, preventing errors later.  The service remembers past validation results to speed things up – it uses memoization.  If you ever need to see all the timeframes you’ve registered, the `list` function provides a simple way to retrieve them.

## Class FrameSchemaService

The FrameSchemaService helps you keep track of the structure of your trading frames, ensuring they all follow a consistent pattern. It uses a special registry to store these frame structures in a type-safe way.

You can add new frame schemas using the `register` method, effectively adding them to the registry. If a frame already exists, you can update it partially with the `override` method.  The `get` method lets you retrieve a specific frame schema by its name.

The service includes a `validateShallow` function to quickly check if a new frame schema has all the necessary parts before it's added. This helps prevent errors down the line. It also has a `loggerService` for logging activities and a private `_registry` where the frame schemas are stored.

## Class FrameCoreService

FrameCoreService is like the central hub for managing timeframes in your backtesting process. It works closely with the connection service to get the actual timeframe data and also handles validating that the timeframes are usable. Think of it as ensuring you have the right dates and times for your trading simulation to run smoothly.

It’s designed to be a foundational component, mainly used behind the scenes by other parts of the backtest-kit.  You can use it to get an array of dates for a particular trading symbol and timeframe, which is essential for stepping through your backtest. 

Essentially, it provides a reliable way to fetch the time periods needed for your backtesting runs.


## Class FrameConnectionService

The FrameConnectionService acts as a central hub for managing and accessing your trading frames. Think of it as a smart router that directs your requests to the correct frame implementation based on the current context. 

It cleverly remembers previously created frames, reusing them when possible to make things faster. This service also handles the backtest timeframe, allowing you to define a start date, end date, and interval for your historical data analysis. 

When in live mode, no frame constraints are applied, as the frameName is empty.

You can use `getFrame` to get a specific frame; it automatically creates it if it doesn’t already exist and caches it for future use.  `getTimeframe` lets you fetch the start and end dates for a symbol within a frame, ensuring your backtests stay within a defined period.

## Class ExchangeValidationService

This service helps you keep track of your trading exchanges and make sure they're set up correctly before you start trading. It acts like a central directory for your exchanges, allowing you to register new ones and confirm they exist. 

You can add new exchanges using `addExchange()`, which essentially registers them with the service.  Before performing any actions on an exchange, you should use `validate()` to check that it's actually registered. This helps prevent errors. To see a complete list of the exchanges you're using, you can call `list()`. The service is designed to be efficient; it remembers the results of validations so it doesn’t have to check things repeatedly.

## Class ExchangeSchemaService

This service keeps track of information about different exchanges, like Binance or Coinbase, in a structured and type-safe way. It acts as a central place to store and manage these exchange details.

You can add new exchange information using the `addExchange()` method (represented by `register`), and easily retrieve existing exchange details by their name using the `get()` method.

Before an exchange's details are officially added, the system quickly checks to make sure the information is in the expected format using `validateShallow`.

If you need to update some, but not all, of an exchange’s details, the `override()` method lets you make targeted changes. The service relies on a logging system (`loggerService`) to keep track of what's happening.

## Class ExchangeCoreService

The ExchangeCoreService acts as a central hub for all exchange-related operations within the backtest-kit framework. It combines the functionality of managing exchange connections with the ability to inject important contextual information like the trading symbol, specific time, and backtest parameters into the processes.

This service is mainly used behind the scenes by other core components.

It provides several methods to interact with the exchange, including fetching historical and future (in backtest mode) candle data. You can also use it to calculate average prices and format prices and quantities, all while ensuring that the correct context is applied. 

The validation process for exchange configurations is also handled here, and it's optimized to prevent unnecessary repeated checks.

## Class ExchangeConnectionService

This service acts as a central hub for interacting with different cryptocurrency exchanges. It intelligently directs your requests to the correct exchange based on the current context, ensuring you're using the right connection for the task.

It keeps track of the exchange connections it’s created, reusing them when possible to improve performance. This avoids repeatedly establishing connections, making your backtesting or trading process more efficient.

You can fetch historical price data (candles), get the next set of candles moving forward in time, retrieve the average price, and properly format prices and quantities to comply with each exchange's specific rules. The service handles the complexities of these exchange-specific details, letting you focus on your trading logic.

## Class ConstantUtils

This class provides a set of predefined constants designed to help manage take-profit and stop-loss levels in your trading strategies. These levels are calculated using a Kelly Criterion approach with a decay factor, aiming for a balanced risk-reward profile.

Think of them as guideposts along the way to your final profit or loss targets. For instance, TP_LEVEL1 signals a partial profit capture at 30% of the distance to your overall target, allowing you to lock in some gains early on. TP_LEVEL2 and TP_LEVEL3 represent increasingly larger portions of the final target, allowing you to secure a larger share of the profits as the trend progresses.

Similarly, SL_LEVEL1 acts as an early warning sign that the trade setup might be weakening, encouraging you to reduce your exposure. SL_LEVEL2 represents a final exit point to protect against potentially large losses. The class itself doesn't require any setup; it's a simple collection of values you can readily incorporate into your strategies.

## Class ConfigValidationService

This service acts as a safety net for your trading configuration. It meticulously checks all the global settings to make sure they make mathematical sense and won't lead to unprofitable trades. 

It ensures that percentages like slippage and fees are non-negative, and that your take profit distance is sufficient to cover those costs, guaranteeing a profit when it's triggered. It also verifies that things like stop-loss distances are set up correctly, and that timeout and retry values are positive integers. Basically, it helps prevent common errors and ensures your configurations are sound.

The `validate` function performs these checks. The service also keeps track of a `loggerService` for reporting any issues it finds during validation.

## Class ClientSizing

This class, ClientSizing, helps determine how much of your capital to use for each trade. Think of it as the engine that figures out your position sizes.

It offers a variety of sizing methods, like using a fixed percentage of your capital, employing the Kelly Criterion, or adapting to market volatility using Average True Range (ATR). You can also set limits on the minimum and maximum size of your positions, as well as restrict the percentage of your total capital that can be used at once. 

The class allows for custom validation and logging through callbacks, giving you more control and insight into the sizing process. Ultimately, it takes input parameters and uses your defined rules to calculate the appropriate position size for your trading strategy.


## Class ClientRisk

ClientRisk helps manage risk for your trading portfolio, acting as a safety net to prevent your strategies from taking on too much exposure. It keeps track of all open positions across different strategies and enforces limits you’re comfortable with, like a maximum number of simultaneous trades.

This system is shared between multiple trading strategies, which allows for a holistic view of your overall risk. It's automatically used when your strategies generate trading signals, preventing unwanted trades before they happen.

The `params` property holds the initial configuration. `_activePositions` is a record of current open positions, constantly updated and accessible for analysis. `waitForInit` ensures this position tracking starts correctly, skipping persistence when running a backtest. `_updatePositions` handles the storage of your position data.

The `checkSignal` function is the core of the risk management – it evaluates incoming signals against defined rules and returns true if the signal is allowed and false if it’s blocked. `addSignal` and `removeSignal` are used to update the position tracking when a signal is opened or closed, respectively, notifying the system of changes.

## Class ClientOptimizer

The `ClientOptimizer` class is responsible for handling the optimization process, acting as a bridge between different components. It gathers data from various sources, manages the LLM conversation history needed for strategy generation, and ultimately creates the final strategy code.

You can think of it as the workhorse that pulls together all the pieces. It uses parameters you provide to define the optimization, and it keeps you updated on the progress using a callback function. 

It has methods to retrieve strategy data, generate the strategy code itself, and save that code to a file. The `getData` method combines information from different data sources. `getCode` builds a complete, runnable strategy, and `dump` saves the result to a file.


## Class ClientFrame

The `ClientFrame` is a tool that creates the timeline of data your backtesting process uses. Think of it as building the schedule for your trading simulation. It generates arrays of timestamps representing the historical periods you want to test on. 

To avoid unnecessary work, it caches previously generated timeframes, so it doesn't recreate them every time. You can customize the spacing between these timestamps, setting intervals from one minute to three days. 

It also lets you add custom checks and logging during the timeframe generation process. This class is the engine that drives the time-based iterations within the backtesting framework, working behind the scenes to provide the data needed for evaluation.


## Class ClientExchange

This class handles interactions with an exchange, providing the data your backtesting strategies need. It's designed to be efficient in its memory usage.

You can use it to retrieve historical candle data, which is useful for analyzing past performance, and also to get future candles, crucial for simulating trading scenarios during backtesting.

It provides a convenient way to calculate the VWAP (Volume Weighted Average Price) based on recent trade activity, helping you understand price trends.

Finally, it simplifies the process of formatting price and quantity values to match the exchange's specific requirements.

## Class BacktestUtils

This utility class simplifies running backtests and gathering results. Think of it as a helper to manage and monitor your backtesting process.

It provides a convenient `run` method for executing backtests, handling the underlying complexities and providing logging. You can also run backtests in the background using `background` when you only need them for tasks like logging or triggering callbacks, without needing to see the detailed results.

To halt a strategy's signal generation, use `stop`, which allows current signals to finish before stopping further activity. `getData` lets you retrieve statistical data from completed backtests, while `getReport` creates a readable markdown report summarizing those results.  The `dump` method provides a way to save these reports to a file. Finally, `list` gives you a view of all currently running backtest instances and their states.

## Class BacktestMarkdownService

The BacktestMarkdownService helps you create reports about your trading backtests. It listens for signal events during a backtest and keeps track of closed trades for each strategy you're testing. It then organizes this data into easy-to-read markdown tables that are saved as files.

Think of it as a reporting tool that automatically generates summaries of how your trading strategies performed. You don’t need to manually collect this information; the service does it for you.

The service uses a clever storage system to keep data separate for each symbol and strategy combination. It's designed to be simple to use – the `tick` method is called during the backtest, and it automatically handles the accumulation of data. You can also retrieve data or generate reports on demand. It also has a clear function to remove all reports and start from scratch. Finally, the service initializes itself when it's first used, so you don't need to worry about setting it up.

## Class BacktestLogicPublicService

This service simplifies running backtests by handling the context—like the strategy name, exchange, and timeframe—automatically. You don’t need to manually pass these details to every function call. 

It works by using a private backtest logic service and managing context information.

The key feature is the `run` method, which lets you initiate a backtest for a specific symbol. It streams the results as you go, making it easy to track progress and analyze performance. Think of it as a streamlined way to execute backtests without getting bogged down in context management.

## Class BacktestLogicPrivateService

This service is designed to run backtests in a memory-friendly way, especially useful when dealing with large datasets. It works by first obtaining the available timeframes and then systematically processing them. When a trading signal appears, it fetches the necessary historical data and executes the backtesting logic. The service intelligently skips ahead in time until a signal closes, and then it reports the result.

Instead of building up a large array of results, it streams them directly to you as an asynchronous generator, allowing for more efficient processing and the ability to stop the backtest early if needed. 

The service relies on several core components for its operation, including services for logging, strategy execution, exchange data, timeframe management, and method context. 

You can start a backtest for a specific trading symbol by calling the `run` method. This will initiate the backtesting process and provide a stream of results as the backtest progresses.

## Class BacktestCommandService

This service acts as a central hub for performing backtests within the trading framework. Think of it as a convenient access point for all things backtesting.

It simplifies how you trigger and manage backtest runs, especially when you're building more complex applications that rely on dependency injection. 

You'll find essential components here, such as services for handling strategy schemas, validating risks, and ensuring the integrity of your data. 

The core functionality lies in the `run` method, which allows you to execute a backtest for a specific trading symbol, providing information about the strategy, exchange, and frame being used. The `run` method returns a generator which will give backtest results as they are available.

# backtest-kit interfaces

## Interface WalkerStopContract

This interface defines the information shared when a walker needs to be stopped. Think of it as a notification that a specific trading strategy, running under a particular walker's control, is being halted.

It includes the trading symbol involved, the name of the strategy being stopped, and importantly, the name of the walker that initiated the stop. This walker name is crucial when you have multiple strategies running concurrently on the same symbol; it allows you to precisely target which walker should respond to the stop signal. 

Essentially, it's a structured message containing the details needed to gracefully interrupt a trading process.

## Interface WalkerStatistics

WalkerStatistics helps you understand how different trading strategies performed during a backtest. Think of it as a way to compare and analyze the outcomes of multiple strategies against each other. It builds upon the standard WalkerResults, adding extra information that lets you see how each strategy stacked up. The core of this is the `strategyResults` property, which provides a list of results for each strategy you ran.

## Interface WalkerContract

The WalkerContract provides updates as your trading strategies are being compared during a backtest. It essentially gives you a snapshot of the progress—telling you which strategy just finished testing, the exchange and symbol being used, and key performance statistics. 

You'll see information like the strategy's name, its performance metrics, and its ranking relative to other strategies tested so far. It also provides context, like the total number of strategies you’re testing and how many have been evaluated. The WalkerContract acts as a real-time notification system for your strategy comparison process.

## Interface TickEvent

The `TickEvent` object provides a single, consistent way to represent all the information related to a trading event. Think of it as a package containing details about what happened during a trade, whether it's just sitting idle, being opened, actively trading, or being closed. 

Each `TickEvent` includes the exact time of the event, the type of action that occurred (like "opened," "active," or "closed"), and the trading symbol involved. You'll also find details like the signal ID, the side of the trade (position), any notes associated with the signal, the current price, and, for orders that have been placed, the open, take profit, and stop-loss prices. Active trades will also provide percentage progress toward the take profit and stop loss. Finally, when a trade closes, the event includes information such as the profit/loss percentage, the reason for closure, and the duration of the trade.

## Interface ScheduleStatistics

ScheduleStatistics helps you understand how your scheduled trading signals are performing. It gives you a breakdown of all the events – signals that were scheduled and those that were cancelled. You can see the total number of signals, as well as the total number of scheduled and cancelled ones. 

The cancellation rate tells you what percentage of your scheduled signals were cancelled, a lower number indicating better performance. You can also see the average wait time for cancelled signals, giving you insight into potential delays or issues. This data is incredibly useful for analyzing and optimizing your trading strategies.

## Interface ScheduledEvent

This interface holds all the key details about scheduled and cancelled trading events, making it easier to create reports and understand what happened. 

Each event has a timestamp indicating when it was scheduled or cancelled. You'll find the trading symbol, a unique signal ID, and the type of position (like long or short). There’s also a note field for any extra information associated with the signal. 

For scheduled events, you're given the intended entry price, take profit level, and stop-loss price. If an event was cancelled, you’re provided with the closing timestamp and duration of the open position. Essentially, it’s a complete package of information about each event.

## Interface ProgressWalkerContract

The ProgressWalkerContract provides updates as a backtest kit walker is running in the background. It gives you visibility into how far along the process is, letting you know which walker is running, the exchange and frame being used, and the trading symbol involved. 

You'll see details like the total number of strategies the walker needs to evaluate, how many have already been processed, and a percentage indicating overall completion. Think of it as a progress bar for your backtesting, letting you monitor and understand the state of your testing process.


## Interface ProgressOptimizerContract

This interface helps you keep an eye on how your trading strategy optimizer is doing. It sends updates during the optimization process, letting you know the optimizer's name, the trading symbol it's working on, and how much work is left to do. You're given the total number of data sources the optimizer needs to analyze, the number it's already finished, and a percentage representing the overall completion. Essentially, it's a progress report to ensure your optimization runs smoothly and you have visibility into its status.


## Interface ProgressBacktestContract

This interface provides updates on the progress of your backtesting runs. Think of it as a way to monitor how far along your strategy is in analyzing historical data. 

You'll receive these updates as your backtest runs in the background, giving you information like the exchange and strategy being used, the trading symbol, the total number of data points being analyzed, and how many have been processed already. 

Crucially, it also provides a percentage representing the completion rate, allowing you to gauge how much longer the backtest will take. It’s a helpful way to keep tabs on long-running backtest operations.

## Interface PerformanceStatistics

This object holds a collection of performance data gathered during backtesting. It provides a way to understand how a trading strategy performed over time. 

You'll find the strategy's name here, along with the total number of performance events recorded and the overall execution time. A key part is the `metricStats` property, which breaks down the statistics into categories based on different performance metrics. Finally, you can access the complete list of raw performance events via the `events` property for detailed analysis.

## Interface PerformanceContract

This interface helps you keep tabs on how your trading strategies are performing. It records key data points like when an operation started and ended, how long it took, and what part of the system was involved. 

You'll find information about the strategy's name, the exchange used, and the trading symbol being analyzed. The interface also distinguishes between metrics gathered during backtesting and those from live trading. 

By tracking these performance metrics, you can pinpoint areas where your system might be slow or inefficient, leading to improvements in your overall trading performance. It’s all about understanding what’s taking time and why.


## Interface PartialStatistics

The `PartialStatistics` object helps you understand the results of a backtest when you’re tracking partial trades—those that aren't all-or-nothing. It provides a collection of key numbers related to these partial events. 

Inside, you'll find the `eventList`, which is a detailed record of each individual profit or loss event. The `totalEvents` property simply tells you the total number of events that occurred.  You also have easy access to `totalProfit` and `totalLoss` to quickly see the overall profit and loss counts.

## Interface PartialProfitContract

This interface describes a notification when a trading strategy reaches a partial profit milestone, like 10%, 20%, or 30% gain. It's used to keep track of how a trade is progressing toward a partial take-profit target and to monitor the strategy's overall performance.

Each notification includes details about the trading pair involved (the symbol), the full details of the signal that triggered it, the market price at the time the level was reached, and the specific profit level achieved. A flag indicates whether the event occurred during a backtest or in live trading. Finally, a timestamp records when the level was detected, which has slightly different meanings depending on whether the trade is live or a backtest.

These notifications are useful for creating reports on trading activity and for allowing users to receive updates on their trades.


## Interface PartialLossContract

This interface describes what happens when a trading strategy experiences a partial loss – like hitting a -10%, -20%, or -30% drawdown. 

It provides details about the trading pair involved (the `symbol`), all the information about the signal that triggered the loss (`data`), and the price at which the level was reached (`currentPrice`). You'll also find the specific loss level that was hit (`level`), whether it's a backtest or live trade (`backtest`), and the exact time of the event (`timestamp`).

Think of it as a notification that a strategy is experiencing a specific level of loss, allowing you to track performance and potentially react to the situation. The `level` field, though a positive number, represents a negative percentage loss – for example, `level=20` means the strategy is down 20% from its entry price.

## Interface PartialEvent

This interface describes a piece of information about a profit or loss event during a trading simulation or live trade. Think of it as a snapshot of a key milestone—like when a trade hits a certain profit or loss level. 

It captures essential details, including the exact time the event happened, whether it was a profit or a loss, the trading pair involved, the name of the strategy making the decision, and a unique identifier for the signal that triggered the trade.

You’ll also find information about the trade’s position (long or short), the current market price, the profit/loss level that was reached, and whether the event occurred during a backtest or a live trading session. It’s designed to be a consolidated record of these important moments for reporting and analysis.

## Interface MetricStats

`MetricStats` holds a collection of statistics related to a specific performance metric. Think of it as a report card for a particular measurement within your backtesting system. 

It tells you how many times a certain action or event occurred (`count`), the total time it took across all instances (`totalDuration`), and provides a range of timing details. You’ll find the average time taken (`avgDuration`), the fastest time (`minDuration`), the slowest (`maxDuration`), and a measure of how spread out the times were (`stdDev`).

It also includes the median time, which is the middle value when you sort all the times, and percentile values like the 95th and 99th to show the times for the faster 95% and 99% of events. Finally, it provides information on the time between those events (`avgWaitTime`, `minWaitTime`, `maxWaitTime`).

## Interface MessageModel

This `MessageModel` helps keep track of conversations when working with large language models. Think of it as a simple way to represent a single turn in a chat – whether it’s instructions you give, a question you ask, or a response you receive.

Each message has a `role` which tells you who sent it: the system (giving instructions), the user (you), or the assistant (the LLM). The `content` property holds the actual text of that message. It's used in the Optimizer to build prompts and remember what's been said.

## Interface LiveStatistics

The LiveStatistics interface gives you a detailed look at your live trading performance. It tracks every event that occurs during trading, from idle periods to opened, active, and closed signals, providing a comprehensive history. You’re given the total number of events, as well as the number of closed trades, broken down into wins and losses.

Key performance indicators like win rate, average PNL per trade, and total cumulative PNL are provided, all expressed as percentages. Risk metrics such as standard deviation (volatility) and the Sharpe Ratio, both annualized, are also available to help evaluate risk-adjusted returns. Finally, the interface calculates a certainty ratio and expected yearly returns to give you a fuller picture of your strategy's potential. Note that certain calculations might return null values if they are unstable or result in undefined results.

## Interface IWalkerStrategyResult

This interface describes the output you get for each individual trading strategy when you're comparing them using backtest-kit. It tells you the name of the strategy being evaluated, and provides a collection of statistics generated from its backtest results.  You'll also find a single metric value used to judge the strategy's performance, and its overall ranking relative to the other strategies in your comparison. The lower the rank number, the better the strategy performed.

## Interface IWalkerSchema

The IWalkerSchema lets you set up A/B tests for your trading strategies. Think of it as a blueprint for comparing different approaches. 

You give it a unique name to identify the test, and can add a note to explain what the test is for. 

The schema specifies which exchange and timeframe should be used for all the strategies involved in the comparison. It also lists the names of the strategies you want to test against each other – these strategies need to be registered beforehand. 

You can choose a metric, like Sharpe Ratio, to optimize during the backtest, or provide custom lifecycle callbacks to monitor and react to events during the process. This schema provides a structured way to define and run comparative tests for your trading strategies.

## Interface IWalkerResults

This object holds all the results after a strategy comparison, essentially summarizing how different strategies performed against each other. It tells you which strategy comparison was run, which asset (symbol) was tested, and which exchange and timeframe were used. You’ll find the metric used for the comparison, like Sharpe Ratio or Sortino Ratio, alongside the total number of strategies that were evaluated. 

The most important piece is identifying the best-performing strategy, along with its metric score and detailed statistics. This gives you a clear picture of which strategy excelled in the backtest.

## Interface IWalkerCallbacks

This interface lets you listen in on what’s happening as backtest-kit runs through comparing different trading strategies. You can use these callbacks to monitor the progress, handle errors, or even react to events during the testing process.

Specifically, `onStrategyStart` lets you know when a particular strategy and symbol combination is beginning its backtest. When a strategy finishes, `onStrategyComplete` will notify you, along with statistics and a key metric.  If something goes wrong and a strategy fails, `onStrategyError` will alert you with details about the error. Finally, when all tests are done, `onComplete` gives you access to the overall results of the entire backtest process.

## Interface IStrategyTickResultScheduled

This interface represents a tick result within the backtest-kit framework, specifically when a trading signal has been scheduled and is awaiting the price to reach the desired entry point. It signifies that a strategy has generated a signal – for example, a buy order – but execution is delayed until a certain price is met.

The result includes details about the strategy that generated the signal, such as its name and the exchange and symbol being traded.  You’ll also find the current price at the time the signal was scheduled, and the scheduled signal itself, which contains the specific entry conditions waiting to be fulfilled. Think of it as a notification that a trade is poised to happen as soon as the market reaches a predetermined price.


## Interface IStrategyTickResultOpened

This interface describes what happens when a new trading signal is created within your backtesting strategy. It’s a notification that a signal has been successfully validated and saved to the system. You'll receive this notification along with important details like the signal's ID, the name of the strategy that generated it, the exchange being used, the trading symbol (like BTCUSDT), and the current price used when the signal opened. Think of it as confirmation that a new trade opportunity is ready to be acted upon.

## Interface IStrategyTickResultIdle

This interface, `IStrategyTickResultIdle`, represents what happens when your trading strategy isn't actively making decisions – it's in an idle state. It provides information about the conditions during that idle period. 

You'll see the `action` property clearly marked as "idle," confirming the state. The `signal` will be `null` because no trading signal is present. To help you track what's happening, the `strategyName`, `exchangeName`, and `symbol` are recorded. Finally, `currentPrice` captures the prevailing price at that moment, giving you a snapshot of the market conditions while the strategy was waiting.

## Interface IStrategyTickResultClosed

This interface represents the result of a trading signal being closed, giving you a complete picture of what happened. It tells you exactly why the signal closed – whether it was due to a time limit expiring, hitting a take-profit level, or triggering a stop-loss. You’re provided with the original signal details, the final price used for calculations, and a detailed breakdown of the profit and loss, including fees and slippage. It also includes tracking information like the strategy and exchange names, alongside the symbol being traded, all to help you analyze your backtesting results.

## Interface IStrategyTickResultCancelled

This interface describes what happens when a scheduled trading signal is cancelled – meaning it didn’t trigger a trade or was stopped before a position could be opened. Think of it as a notification that a planned action didn't go through.

It provides details about the cancelled signal, like the signal itself (`signal`), the price at the time of cancellation (`currentPrice`), and when the cancellation occurred (`closeTimestamp`).  You’ll also find information about which strategy and exchange were involved, along with the trading pair being considered (`strategyName`, `exchangeName`, `symbol`).  The `action` property simply confirms that this is a cancellation event.

## Interface IStrategyTickResultActive

This interface describes a trading scenario where a strategy is actively monitoring a signal, waiting for either a take profit (TP), stop loss (SL), or time expiration to occur.  It represents a situation where the strategy isn't currently executing a trade but is holding a position and observing its progress.

You'll see properties like `signal`, which holds the data about the signal being watched, and `currentPrice`, which is the market price used for monitoring. The `strategyName`, `exchangeName`, and `symbol` properties help track which strategy, exchange, and trading pair are involved.

Finally, `percentTp` and `percentSl` tell you how far along the strategy is towards its take profit and stop loss targets, respectively – helpful for visualizing the risk management in play.


## Interface IStrategySchema

This interface describes the blueprint for a trading strategy you register with backtest-kit. Think of it as defining how your strategy makes decisions – when to buy or sell.

Each strategy needs a unique name to identify it within the system. You can also add a note to explain your strategy's logic.

The `interval` property controls how frequently your strategy can generate signals, preventing it from overwhelming the system.

The core of your strategy lies in the `getSignal` function. This is where you write the logic that analyzes data and decides when to execute a trade; it can even wait for a specific price to be reached.

You can optionally provide lifecycle callbacks like `onOpen` and `onClose` to handle specific events related to your strategy.

Finally, the `riskName` lets you associate your strategy with a particular risk profile for more sophisticated risk management.

## Interface IStrategyResult

This interface, `IStrategyResult`, is designed to hold the key information about a trading strategy after it’s been tested. Think of it as a record for each strategy you're evaluating.

It includes the strategy’s name so you know exactly which strategy the data represents.  You'll also find a comprehensive set of statistics, detailed in the `BacktestStatistics` interface, providing a full picture of its performance. Finally, a `metricValue` captures the score used to rank the strategies, helping you easily compare them.  If the metric isn’t valid for a strategy, this value will be null.


## Interface IStrategyPnL

This interface, `IStrategyPnL`, represents the result of calculating a trading strategy's profit and loss. It gives you key details about how well your strategy performed.

The `pnlPercentage` property tells you the profit or loss expressed as a percentage – a positive number means a profit, and a negative number indicates a loss.

To understand the actual prices used in the calculation, `priceOpen` shows the entry price after accounting for fees and slippage, while `priceClose` displays the exit price with the same adjustments. These adjusted prices give a more realistic view of your strategy’s performance by considering transaction costs.


## Interface IStrategyCallbacks

This interface provides a set of optional callbacks that let you react to different stages of a trading strategy's lifecycle. Think of them as hooks you can use to customize what happens when a signal is opened, becomes active, goes idle, or gets closed.

You can specify functions to be executed on every tick of market data, or when a signal transitions between states like opening, becoming active, going idle, closing, or being scheduled for later execution. There are also callbacks for handling scheduled signals that are created or cancelled, plus notifications when a signal reaches a partial profit or loss state. The `onWrite` callback helps with persisting data during testing. These callbacks give you a way to build more responsive and insightful trading systems.

## Interface IStrategy

The `IStrategy` interface outlines the essential methods any trading strategy will use within the backtest-kit framework.

The `tick` method represents a single step in the strategy's execution, handling VWAP tracking, signal generation, and checking for take-profit/stop-loss conditions.

`getPendingSignal` lets you check what signal the strategy is currently monitoring – it’ll return `null` if there’s nothing active. This is useful for things like monitoring TP/SL or time expiration.

The `backtest` method provides a quick way to test a strategy against historical data, stepping through each candle to calculate VWAP and check TP/SL.  For strategies with scheduled signals, it manages signal activation and cancellation before moving on to TP/SL monitoring.

Finally, `stop` is used to halt a strategy from producing new signals. It's a gentle way to shut things down, as existing positions will continue to monitor TP/SL and expiration until they’ve naturally closed.

## Interface ISizingSchemaKelly

The `ISizingSchemaKelly` interface defines how to size trades using the Kelly Criterion, a method for determining optimal bet sizes. It requires you to specify that the sizing method is indeed "kelly-criterion".  You’re also asked to provide a `kellyMultiplier`, which controls how aggressively the Kelly Criterion is applied; a lower multiplier (like the default of 0.25) is generally considered safer than a higher one. This multiplier essentially scales back the full Kelly Criterion recommendation to avoid potentially ruinous bet sizes.

## Interface ISizingSchemaFixedPercentage

This schema defines a consistent way to size your trades, always using a fixed percentage of your available capital for each one. It's simple and predictable – you specify a `riskPercentage` value, which represents the maximum percentage of your capital you’re willing to risk on a single trade. This value should be between 0 and 100, and it’s the core of how your trade size is calculated. The `method` property always identifies this as a "fixed-percentage" sizing strategy.

## Interface ISizingSchemaBase

This interface, `ISizingSchemaBase`, provides a foundational structure for defining how much of your trading account to allocate to each trade. Think of it as a blueprint for sizing strategies.

It includes essential details like a unique name to identify the sizing configuration, an optional note for developer documentation, and limits on position size, both as a percentage of your account and as specific absolute values. 

You can also attach lifecycle callbacks to this sizing schema if you need to customize its behavior at different points. This base interface ensures consistency and provides a clear framework for creating various sizing strategies within your backtest.

## Interface ISizingSchemaATR

This schema defines how your trades will size positions based on the Average True Range (ATR). Essentially, it tells backtest-kit to calculate your position size by considering the ATR, helping to manage risk.

The `method` is always "atr-based" to confirm you’re using this specific sizing strategy. 

`riskPercentage` is the maximum percentage of your capital you're willing to risk on a single trade, expressed as a number between 0 and 100. 

Finally, `atrMultiplier` controls how far your stop-loss is placed relative to the ATR; a higher value means a wider stop.

## Interface ISizingParamsKelly

The `ISizingParamsKelly` interface defines how to configure a sizing strategy based on the Kelly Criterion. It's used when creating a `ClientSizing` object, essentially telling your trading system how much to bet on each trade. 

You're required to provide a `logger` – this is a tool for tracking and displaying debug information about your sizing decisions, which is really helpful for understanding why your system is placing the trades it is. Think of it as a way to peek behind the curtain and see what's going on with your betting amounts.

## Interface ISizingParamsFixedPercentage

This interface, `ISizingParamsFixedPercentage`, helps you define how much of your capital you're going to use for each trade when using a fixed percentage sizing strategy. It's a simple way to control your position sizes.

You're required to provide a `logger`, which is a service that allows you to see debugging information about your backtest. This logger helps you understand what the framework is doing and troubleshoot any issues that might arise.

## Interface ISizingParamsATR

This interface, `ISizingParamsATR`, helps you define how much of your capital you're going to use for each trade when using an ATR-based sizing strategy within the backtest-kit framework. It's all about controlling the size of your positions. 

The key component here is the `logger`. It’s a tool that lets you track what’s happening during your backtesting process – think of it as a way to get debug information and understand how your sizing parameters are influencing your trades.

## Interface ISizingCallbacks

This interface defines a set of functions that can be used to observe and potentially modify the sizing process within backtest-kit. Think of it as a way to tap into what's happening when the framework decides how much to buy or sell.

Specifically, the `onCalculate` function is called right after the system calculates the size of a trade. You can use this to check if the size makes sense based on your strategy or to record information about the calculation for later review. It provides the calculated quantity and additional parameters related to the sizing process.

## Interface ISizingCalculateParamsKelly

This interface defines the information needed to calculate trade sizing using the Kelly Criterion. It specifies that the sizing method will be the Kelly Criterion and requires you to provide the win rate – essentially, how often you expect a trade to be successful – and the average win/loss ratio, which represents how much you typically win compared to how much you lose on a trade. Think of it as feeding in your historical performance data to determine an optimal bet size.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the information needed to calculate trade sizes using a fixed percentage approach. It requires you to specify the method as "fixed-percentage" to indicate you're using this sizing technique. Crucially, you’re also required to provide a `priceStopLoss`, which represents the price at which a stop-loss order will be triggered. This helps determine the size of the trade based on the stop-loss level.

## Interface ISizingCalculateParamsBase

This interface, `ISizingCalculateParamsBase`, provides the fundamental data needed when figuring out how much of an asset to trade. It includes the symbol of the trading pair, like "BTCUSDT", so you know which assets are involved.  It also provides your current account balance, which is critical for determining your position size. Finally, it gives you the planned entry price, the price at which you intend to buy or sell. Think of it as the common ground for all the different ways you calculate your trade sizes.

## Interface ISizingCalculateParamsATR

This interface defines the information needed when you're using the Average True Range (ATR) to determine how much of your capital to allocate to a trade. It ensures you provide both the calculation method – confirming you're using an ATR-based approach – and the ATR value itself, which is a key component in the sizing calculation. Think of it as a structured way to pass the essential data needed to figure out your position size based on the ATR indicator.

## Interface ISizing

The `ISizing` interface is all about figuring out how much of an asset your trading strategy should buy or sell. It’s a core component used behind the scenes when your strategy is actually executing trades.

The key part of this interface is the `calculate` function. This function takes a set of parameters related to risk management – things like how much risk you're willing to take on each trade – and then figures out the optimal position size based on those settings. The result is a number representing the quantity of the asset to trade.


## Interface ISignalRow

This interface represents a complete trading signal within the backtest-kit framework. Think of it as the finalized version of a signal, ready to be used for backtesting or live trading. Each signal gets a unique ID, and important details like the entry price, the exchange and strategy it came from, and when it was created are all stored here. The `pendingAt` field tells you when the trade actually started to move towards execution. It also includes the symbol being traded, like "BTCUSDT," and a special internal flag to mark signals that were scheduled in advance.

## Interface ISignalDto

This describes the structure of a signal, the information used to tell the backtest-kit how to trade. When you request a signal, you’ll receive data in this format.

Each signal includes details like whether it's a "long" (buy) or "short" (sell) trade, a description of why the signal was generated, and the entry price. 

You'll also define target prices: a take profit level and a stop-loss level. Importantly, these levels have rules - take profit must be higher for a long position and lower for a short position, and the stop loss works the opposite way.  Finally, you estimate how long you expect the trade to last. 

The backtest-kit will automatically assign a unique ID to each signal if you don't provide one yourself.

## Interface IScheduledSignalRow

This interface, `IScheduledSignalRow`, describes a signal that's waiting for a specific price to be reached before a trade is executed. Think of it as a signal on hold – it’s not active yet because the market price hasn't hit the desired entry price.

It builds upon the `ISignalRow` interface, adding the crucial element of delayed execution.  Once the price reaches the `priceOpen` value, this scheduled signal transforms into a standard pending signal.  

A key detail is the `pendingAt` property, which initially reflects the time the signal was scheduled. This gets updated to the actual waiting time once the signal is activated by the market price. This helps track how long the signal was truly waiting.

## Interface IRiskValidationPayload

This data structure holds all the information needed when evaluating risk. It combines details about a pending trade signal with a snapshot of your portfolio’s current state. 

You'll see the signal that's about to be executed, represented by `pendingSignal`.  It also includes how many positions you currently have open (`activePositionCount`) and a complete list of those active positions (`activePositions`). Think of it as a quick look at your portfolio's health before deciding whether to proceed with a trade.

## Interface IRiskValidationFn

This defines a function type used to check if your trading strategy's risk parameters are set up correctly. Think of it as a quality control step – it ensures your strategy isn't going to accidentally take on too much risk. This function takes your risk parameters as input and then performs whatever checks you need to make sure they are within acceptable limits. If something isn't right, it throws an error to alert you to the problem so you can fix it before your backtest begins.

## Interface IRiskValidation

This interface helps you define how to check if your trading risks are acceptable. Think of it as setting up rules to make sure your trades are safe. 

You provide a `validate` function, which is the core of the check – it's the logic that actually decides if the risk parameters are okay. 

Optionally, you can add a `note` to explain what the validation is doing. This note is useful for anyone reading your code or configuration to understand the purpose of the risk validation rule.

## Interface IRiskSchema

This interface, `IRiskSchema`, lets you define and register custom risk controls for your trading backtests. Think of it as a way to build rules that govern your portfolio’s behavior, ensuring it stays within acceptable boundaries. 

Each schema needs a unique `riskName` to identify it. You can also add an optional `note` to explain the purpose of the risk control for other developers. 

`callbacks` allow you to hook into specific events like when a trade is rejected or allowed, giving you a chance to react programmatically. The core of the schema lies in the `validations` array. This array holds the actual rules you’re implementing to check and potentially block trades based on your defined criteria. You can define these validations as functions or pre-built validation objects.


## Interface IRiskParams

The `IRiskParams` interface defines the information needed when setting up the risk management component of your backtesting strategy. Think of it as the configuration for how your strategy handles risk.

It includes a `logger`, which is essential for observing what's happening behind the scenes – debugging, tracking progress, and understanding potential issues in your backtest.  This logger allows you to get helpful messages about your strategy's behavior.

## Interface IRiskCheckArgs

The `IRiskCheckArgs` interface holds the information needed to decide whether a new trade should be allowed. Think of it as a gatekeeper, consulted before a signal is actually created. It provides details about the potential trade, like which asset (`symbol`) is involved and the specifics of the `pendingSignal` itself. 

You’ll also find the name of the `strategyName` making the request, along with the `exchangeName` it's using. The `currentPrice` and `timestamp` provide real-time market data for accurate risk assessment. Essentially, it’s a collection of context data needed to safely determine if a new trading opportunity is viable.

## Interface IRiskCallbacks

This interface, `IRiskCallbacks`, provides a way to be notified about the outcomes of risk checks performed during trading simulations. You can use it to get alerts when a trading signal is blocked due to risk limits – that's what the `onRejected` callback handles. Conversely, `onAllowed` lets you know when a signal successfully passes all the defined risk checks and is cleared to proceed. These callbacks provide a flexible mechanism to monitor and react to risk-related events within your backtesting environment.

## Interface IRiskActivePosition

This interface, `IRiskActivePosition`, represents a single, currently open trading position that’s being monitored for risk management purposes. It's used by the ClientRisk component to track positions across different trading strategies. 

Think of it as a snapshot of a trade – it tells you which strategy initiated it, which exchange it’s on, when it was opened, and provides details about the signal that triggered the trade. The `signal` property holds specifics about that signal, giving context for why the position was taken. It's a way to see how different strategies are interacting and potentially impacting overall portfolio risk.

## Interface IRisk

The `IRisk` interface helps manage and control the risk involved in your trading strategies. Think of it as a gatekeeper, ensuring that your signals don't violate pre-defined risk limits. 

It provides methods for checking if a signal is permissible (`checkSignal`), registering when a position is opened (`addSignal`), and cleaning up when a position is closed (`removeSignal`). By using this interface, your backtesting framework can automatically enforce your risk parameters and prevent potentially harmful trades. Essentially, it's designed to keep your trading within safe and manageable boundaries.

## Interface IPositionSizeKellyParams

This interface helps you define how much of your capital to risk when using the Kelly Criterion for position sizing. It's all about calculating the right bet size based on your win rate and how much you typically win compared to how much you lose. You'll specify your `winRate`, representing the percentage of times you win, and the `winLossRatio`, which tells you the average profit you make on a winning trade versus the average loss on a losing one. These two values work together to determine a safe and potentially profitable position size.

## Interface IPositionSizeFixedPercentageParams

This interface defines the parameters needed to calculate position sizes using a fixed percentage of your account balance. It’s particularly useful when you want to risk a consistent portion of your capital on each trade. 

The `priceStopLoss` property specifies the price at which your stop-loss order will be triggered. This value is crucial for determining the initial position size, as the framework uses it to estimate the maximum potential loss per trade.

## Interface IPositionSizeATRParams

This section describes the parameters used when calculating position size based on the Average True Range (ATR). Specifically, it focuses on the `IPositionSizeATRParams` interface, which defines the settings needed for this sizing method. The most important parameter here is `atr`, which represents the current ATR value. This value is crucial for determining how much capital to allocate to a trade, as it reflects the market's volatility.

## Interface IPersistBase

This interface lays the groundwork for how your backtest-kit framework interacts with storage, whether it's a file system or a database. It handles the essential operations for managing data – reading, checking for existence, and writing.

`waitForInit` helps ensure that the storage area is properly set up and ready to go, only running the setup once.

`readValue` retrieves an entity, allowing you to access previously saved data.

`hasValue` provides a quick way to determine if a particular piece of data already exists.

Finally, `writeValue` handles saving your data, making sure writes are handled safely and reliably.

## Interface IPartialData

This interface, `IPartialData`, helps save and load important information about a trading signal. Think of it as a snapshot of key progress points. 

It specifically stores the profit and loss levels that have been hit during trading. These levels are saved as arrays of `PartialLevel` objects, because sets aren't directly compatible with JSON when saving data.

This partial data is used by the persistence layer to keep track of signal state and is later reconstructed into the full `IPartialState` when the system loads the data back.


## Interface IPartial

This interface, `IPartial`, helps track how much profit or loss a trading signal is making. It’s used by the system to keep tabs on milestones like reaching 10%, 20%, or 30% profit.

The `profit` method is called when a signal is making money; it figures out which profit levels have been achieved and alerts the system. A similar `loss` method handles situations where a signal is losing money, also tracking and reporting loss levels.

Finally, when a signal is finished – whether it hits a stop-loss, take-profit, or expires – the `clear` method cleans up the tracked data, removes it from memory, and saves the changes. This ensures that the system doesn’t hold onto information about closed signals.

## Interface IOptimizerTemplate

The `IOptimizerTemplate` interface helps create building blocks for your backtesting code, especially when working with LLMs. It provides functions to generate various code snippets needed for setting up and running your trading simulations.

You can use it to automatically generate the initial setup code (`getTopBanner`), create messages for your LLM conversations (`getUserMessage`, `getAssistantMessage`), and define the structure of your trading environment.  It also handles generating code for specific components like Exchanges (`getExchangeTemplate`), Frames (timeframes) (`getFrameTemplate`), and Strategies (`getStrategyTemplate`). 

Furthermore, it provides helper functions to format and structure data for LLMs (`getJsonTemplate`, `getTextTemplate`), and generates the necessary code to launch your backtesting process (`getLauncherTemplate`). Finally, `getJsonDumpTemplate` assists with debugging by creating a helpful function for inspecting data.

## Interface IOptimizerStrategy

This interface, `IOptimizerStrategy`, bundles together all the information that helps us understand where a trading strategy came from. Think of it as a complete package—it holds the trading symbol the strategy is designed for, a unique name to easily identify it, and a record of the conversation with the language model that created it. 

The `messages` property is particularly valuable; it's the full transcript of the conversation, showcasing the user's requests and the model's responses during strategy generation. Finally, the `strategy` property contains the actual text of the strategy itself, the output from the prompting process that defines how the system should trade.

## Interface IOptimizerSourceFn

The `IOptimizerSourceFn` is designed to provide the data needed to train and optimize trading strategies. Think of it as a way to feed data into your backtesting system. It’s specifically built to handle large datasets by using pagination, meaning it fetches data in chunks rather than all at once.  Crucially, the data it provides needs to have unique identifiers associated with each piece of information, allowing the backtest kit to keep track of everything. This function helps streamline the process of getting your training data into the backtest framework.

## Interface IOptimizerSource

This interface helps you define where your backtest data comes from and how it's presented to a language model. Think of it as setting up the pipeline for your LLM to learn from your trading history.

You give it a `name` so you can easily identify the data source. The `note` field provides a way to add a descriptive label. 

The crucial part is the `fetch` function – this tells backtest-kit how to actually retrieve the trading data, and it needs to handle getting data in chunks (pagination). 

Finally, you can customize the way data is formatted into user and assistant messages for the LLM using the optional `user` and `assistant` functions. If you don’t specify these, backtest-kit will use its own default formatting.

## Interface IOptimizerSchema

This interface describes how your optimizer will work within the backtest-kit framework. Think of it as a blueprint for creating and evaluating different trading strategies.

You'll use `optimizerName` to give your optimizer a unique identifier, making it easy to reference later. `rangeTrain` allows you to split your historical data into different training periods, allowing the framework to generate and compare several strategy versions based on those distinct training sets. `rangeTest` defines the time period used to evaluate how well those generated strategies perform.

`source` is where you specify the data sources, like historical prices or economic indicators, that your optimizer will use as input.  The `getPrompt` function is responsible for crafting the prompt given to the language model, combining information from all your data sources and previous interactions.

`template` lets you customize certain aspects of the strategy generation process. If you don't specify anything here, the framework will use its default settings. Finally, `callbacks` give you opportunities to monitor the optimizer's progress and potentially adjust its behavior along the way.

## Interface IOptimizerRange

This interface, `IOptimizerRange`, helps you specify the timeframe for backtesting or optimizing your trading strategies. Think of it as defining a window of time to analyze.

You'll use it to set both a `startDate` and `endDate`, clearly marking the beginning and end dates within your historical data.  It's inclusive, meaning both those dates are included in the period being considered.

You can also add a `note` to briefly describe the purpose or context of this specific timeframe, like "Initial strategy testing" or "Period of high volatility." This note is optional but can be helpful for organization and understanding later on.

## Interface IOptimizerParams

This interface defines the core settings needed to create an optimizer within the backtest-kit framework. Think of it as a blueprint for configuring how the optimization process will run.

It includes a `logger`, which is essential for tracking what's happening during the optimization and helping you troubleshoot any issues.  You don’t typically set this yourself, as it's managed by the system.

The `template` property holds the complete set of methods and configurations for the optimization itself. This combines your own template definition with some default settings provided by the framework, ensuring everything works together seamlessly.

## Interface IOptimizerFilterArgs

This interface, `IOptimizerFilterArgs`, helps define the criteria for fetching historical data needed for backtesting and optimization. Think of it as a way to specify *what* data you want—which trading pair (like BTCUSDT) and over what timeframe (start date and end date). It's used behind the scenes to make sure the backtest kit only pulls in the data you need to run your simulations. The `symbol` property identifies the trading pair, while `startDate` and `endDate` pinpoint the beginning and end dates for the historical data.

## Interface IOptimizerFetchArgs

This interface defines the information needed to request data in chunks when working with paginated data sources. Think of it like asking for a portion of a larger dataset – you specify how many records you want (`limit`) and where to start from (`offset`). The `limit` property controls the maximum number of items returned per request, defaulting to 25, while `offset` tells the system how many records to skip before starting the current page of data. You can easily calculate the page number using `offset` and `limit`.

## Interface IOptimizerData

This interface defines the basic structure for data used when optimizing trading strategies. Every data source you use for backtesting needs to provide a unique identifier for each piece of data. Think of it like a serial number – it’s how the system makes sure it doesn’t process the same data twice, especially when dealing with large datasets that need to be fetched in chunks. This ID is crucial for ensuring accurate and reliable backtesting results.

## Interface IOptimizerCallbacks

This interface provides a way to observe what's happening during the optimization process. Think of it as a set of hooks you can use to peek into and potentially influence how the backtest kit operates.

You can use `onData` to monitor the data generated for each strategy during training; this is great for logging or making sure the data looks right. Similarly, `onCode` lets you see the code that's been created for your strategies, enabling code validation or logging.  If you need to track when strategy code is saved to a file, `onDump` will be your go-to hook. Finally, `onSourceData` gives you a chance to inspect the raw data fetched from your data sources, allowing you to confirm it’s arriving as expected and validating its contents.

## Interface IOptimizer

The `IOptimizer` interface provides a way to interact with the backtest-kit framework to automatically generate and export trading strategies. It’s essentially a tool that helps create trading code based on data.

You can use it to retrieve strategy data, which involves pulling information from various sources and preparing it for code generation. 

The framework also allows you to generate the full trading strategy code, including all necessary parts like imports and helper functions.

Finally, the `dump` function lets you save the generated code directly to a file, creating any necessary directories to organize your strategies.

## Interface IMethodContext

The `IMethodContext` interface provides essential information about the current trading operation. Think of it as a little packet of data that travels alongside your code, telling it *which* exchange, strategy, and frame to use.  It's automatically provided during execution, so you don't have to manually pass around these details. The `exchangeName` tells the system which exchange to interact with, `strategyName` specifies which strategy to apply, and `frameName` indicates which historical data frame to use – it's blank when running a live trade. Essentially, it helps the backtest-kit framework find the right components for each step in your trading logic.

## Interface ILogger

The `ILogger` interface provides a standardized way for different parts of the backtest-kit framework to record information. Think of it as a central system for keeping track of what's happening.

It includes methods for logging messages at different levels of importance: `log` for general events, `debug` for detailed development information, `info` for routine successes, and `warn` for potential issues that need investigation. This allows developers to monitor system behavior, debug problems, and generally understand how the framework is operating. Components like agents, sessions, and storage all use this logger to communicate their activities.

## Interface IHeatmapStatistics

This interface defines the structure for presenting statistics related to a portfolio's heatmap visualization. It gathers key data points across all assets within the portfolio, allowing for a broad overview of performance.

You’re getting a breakdown that includes details like the statistics for each individual symbol, the total number of symbols being tracked, the overall profit and loss (PNL) for the entire portfolio, the portfolio’s Sharpe Ratio, and the total number of trades executed. Essentially, it provides a consolidated view of your portfolio’s activity and profitability.


## Interface IHeatmapRow

This interface represents a row of data within a portfolio heatmap, providing a quick summary of performance for a specific trading pair, like BTCUSDT. It gathers key metrics from all the strategies you're using for that pair.

You'll find information on total profit or loss, how your risk-adjusted returns compare (Sharpe Ratio), and the largest peak-to-trough decline experienced (Max Drawdown). It also tracks the total number of trades executed, broken down into wins and losses, helping you understand your win rate and the average profit or loss per trade.

Further details include the standard deviation of your trading results, a profit factor reflecting the ratio of wins to losses, and how your win and loss streaks are performing. Finally, the expectancy provides an estimate of your average profit per trade based on win/loss tendencies.

## Interface IFrameSchema

The `IFrameSchema` helps you define the basic structure of your backtesting environment. Think of it as setting the stage for your trading strategies. You're essentially telling the system how far back you want to test, the frequency of your data (like daily, hourly, or minute-by-minute), and giving it a unique name. 

It includes properties like `frameName` for easy identification, `startDate` and `endDate` to specify your backtest period, and `interval` to determine the data frequency.  You can also add a `note` for yourself to remember why you set up this particular timeframe.  Finally, `callbacks` lets you attach custom functions to specific points in the frame's lifecycle, allowing for more advanced control and observation.


## Interface IFrameParams

The `IFramesParams` interface defines the information needed when setting up a ClientFrame, which is a core component for running trading strategies. Think of it as the configuration settings for your trading environment. 

It builds upon `IFramesSchema`, essentially adding a `logger` property. This `logger` is a handy tool to help you track what's happening inside your trading framework, making debugging and understanding your strategy's behavior much easier. It allows you to output debug messages and track the process.

## Interface IFrameCallbacks

This section describes the `IFrameCallbacks` interface, which lets you hook into different stages of the backtest-kit’s timeframe generation process. It provides a way for your code to react to and potentially modify the timeframes being used in your backtesting.

The key property here is `onTimeframe`. This function gets called each time a new array of dates (the timeframe) is created. Inside this function, you’ll receive the generated timeframe itself, along with the start and end dates used to create it, and the interval used. You might use this to check if the timeframes look correct or to log the generated dates for debugging purposes.


## Interface IFrame

The `IFrames` interface is a core part of how backtest-kit organizes and manages time data. Think of it as the engine that creates the schedule for your backtesting simulations. 

Its main function, `getTimeframe`, is responsible for building lists of timestamps. You give it a symbol (like "BTCUSDT") and a frame name (like "1h" for one-hour intervals), and it returns an array of dates that your backtesting logic will iterate over. This allows backtest-kit to accurately simulate trading over a defined period with the specified time intervals.

## Interface IExecutionContext

The `IExecutionContext` interface holds important information about the environment your trading strategy is running in. Think of it as a package of details passed along to your code during execution. It tells your strategy which trading pair, like "BTCUSDT," it's working with and what the current timestamp is. Most importantly, it indicates whether you're in backtest mode – running a simulation – or in live trading mode. This context is automatically provided by the `ExecutionContextService` to functions like fetching historical data or handling ticks.

## Interface IExchangeSchema

This interface outlines the structure for defining how backtest-kit interacts with different exchanges. Think of it as a blueprint for connecting to a data source like Binance, Coinbase, or even a custom database.

Each exchange you want to use needs to be registered with backtest-kit using this schema.  You’re essentially telling the framework where to get historical price data and how to handle trade quantities and prices according to that exchange’s specific rules.

The `exchangeName` is a unique identifier so the framework knows which exchange it's dealing with. The `getCandles` function is the most important part; it’s the code that actually fetches the historical price data.  `formatQuantity` and `formatPrice` ensure trades are recorded accurately by adhering to the exchange’s precision requirements. Finally, the `callbacks` property lets you hook into certain events, like when new candle data arrives.

## Interface IExchangeParams

The `IExchangeParams` interface defines the information needed to set up an exchange within the backtest-kit framework. Think of it as the blueprint for how your exchange interacts with the system. 

It requires a `logger` – a way to output debugging information and track what's happening during your backtesting.  

Crucially, it also needs an `execution` object. This object holds vital contextual data like the symbol you're trading, the point in time you’re simulating, and whether you're running a backtest versus a live trade. This ensures everything aligns within the backtest environment.


## Interface IExchangeCallbacks

The `IExchangeCallbacks` interface lets you hook into data events from the exchange. Specifically, the `onCandleData` callback gets triggered whenever the backtest-kit framework retrieves candlestick data. You can use this callback to react to new candle data arriving for a particular trading symbol and time interval, giving you control over how that data is processed within your backtesting environment. The callback provides the symbol, interval, the starting date and time, the number of candles requested, and an array of the candle data itself.

## Interface IExchange

The `IExchange` interface defines how backtest-kit interacts with a trading exchange. It provides essential functionalities to retrieve historical and future candle data – think of it as a way to access the price history of a particular asset.

You can use it to fetch past price movements (`getCandles`) or look ahead to simulate future price action (`getNextCandles`) during a backtest.

The interface also includes methods to correctly format order quantities and prices (`formatQuantity`, `formatPrice`) to match the exchange's specific requirements. Finally, it calculates the Volume Weighted Average Price (VWAP) based on recent trading activity, useful for understanding average price levels.

## Interface IEntity

The `IEntity` interface serves as the foundation for all data objects that are saved and retrieved from storage within the backtest-kit framework. Think of it as the common starting point for all your data models, ensuring they share a consistent structure. This interface defines the core properties expected of entities, providing a solid base for building and managing your trading data.

## Interface ICandleData

This interface defines the structure of a single candlestick, which is a fundamental building block for analyzing price movements and testing trading strategies. Each candlestick represents a specific time interval and contains information about the opening price, the highest and lowest prices reached, the closing price, and the volume traded during that time. The `timestamp` property tells you exactly when the candle began, using a standard Unix timestamp in milliseconds. This data is essential for calculating indicators like VWAP and for running backtests to evaluate how a trading strategy would have performed historically.

## Interface DoneContract

This interface represents what's sent when a background task finishes, whether it's a backtest or a live trading execution. It provides key details about the completed process, telling you which exchange was used, the name of the trading strategy involved, and whether it was a backtest or a live run. You’ll also find the trading symbol, like "BTCUSDT", so you know exactly what asset was being traded. Think of it as a notification that a process has wrapped up, accompanied by its important identifying information.


## Interface BacktestStatistics

This interface holds key statistics calculated from your backtesting runs. It gives you a detailed view of how your trading strategy performed. 

You'll find a list of every closed trade (`signalList`), along with the total number of trades made (`totalSignals`). It breaks down the results into winning trades (`winCount`) and losing trades (`lossCount`). 

The interface also provides percentage-based metrics like win rate (`winRate`), average PNL per trade (`avgPnl`), and total PNL across all trades (`totalPnl`). Risk metrics are included too, such as standard deviation (`stdDev`) which measures volatility, and the Sharpe Ratio (`sharpeRatio` and `annualizedSharpeRatio`) which assesses risk-adjusted performance. A `certaintyRatio` provides insight into the relative strength of winning versus losing trades, and `expectedYearlyReturns` gives an estimate of yearly profitability. Note that any calculation resulting in an unsafe numerical value (like division by zero) will be represented as null.
