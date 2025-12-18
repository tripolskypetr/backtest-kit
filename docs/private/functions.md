---
title: private/functions
group: private
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

You can now control where backtest-kit sends its log messages by providing your own logger. This lets you integrate the framework's logging with your existing systems, like a file, a database, or a centralized logging service. The framework will automatically add useful context to each log message, such as the trading strategy name, the exchange being used, and the symbol being traded. Just provide an object that implements the `ILogger` interface, and the framework will take care of the rest.

## Function setConfig

This function lets you adjust how backtest-kit operates, allowing you to customize settings beyond the defaults. Think of it as fine-tuning the engine of your trading simulations. You provide a new set of configuration values, and only the ones you specify will be changed; the rest will remain as they originally were. There's a special "unsafe" flag you might use in testing environments to bypass some of the configuration checks, but be careful when using it.

## Function setColumns

This function lets you customize the columns displayed in your backtest reports. You can change how information like price, volume, or trade details is presented. It's useful if you want to tailor the reports to your specific analysis needs.  You provide a partial configuration object to override the default settings, but the framework will usually check your configuration to make sure it’s valid.  If you're working in a testbed environment and absolutely need to bypass these validations (at your own risk), you can use the `_unsafe` flag.

## Function listWalkers

This function lets you see a complete inventory of all the trading strategies (walkers) currently set up within your backtest. Think of it as a way to check what's running behind the scenes. It gives you a list containing details about each strategy, which can be helpful for troubleshooting, creating documentation, or even building tools that adapt to the strategies you're using. It’s like looking under the hood to understand the full picture of your trading environment.

## Function listStrategies

This function gives you a way to see all the trading strategies that backtest-kit knows about. It essentially provides a list of descriptions for each strategy, outlining things like what data it needs and how it works. Think of it as a quick inventory of your available strategies, perfect for understanding what's available or building tools to manage them. It's a simple way to get a clear picture of your trading strategy setup.

## Function listSizings

This function lets you see all the sizing rules that are currently active within the backtest-kit system. Think of it as a way to peek under the hood and understand how your positions are being sized for each trade.  It gives you a list of all the sizing configurations, which is handy if you're troubleshooting, want to generate documentation, or need to create a user interface that adapts to those configurations. The result is a promise that resolves to an array of sizing schema objects.

## Function listRisks

This function gives you a peek into all the risk assessments your backtest-kit setup is using. It’s like getting a complete inventory of how your strategies are being protected. The function returns a list of risk configurations, which can be helpful for understanding how your system is designed, troubleshooting potential issues, or even creating tools to visualize these settings. Essentially, it’s a way to see all the risk checks that are currently active within your backtesting environment.

## Function listOptimizers

This function helps you discover what optimization strategies are available within your backtest-kit setup. It returns a list of descriptions for each optimizer that has been registered. Think of it as a way to see what options you have for fine-tuning your trading strategies – it's handy for checking your configuration or creating tools that automatically display optimization choices. You can use this list to understand what's possible and troubleshoot any issues related to your optimizers.

## Function listFrames

This function helps you see all the different data "frames" your backtest kit is using. Think of frames as organized sets of data, like historical prices or trading signals. It returns a list of descriptions for each of these frames, letting you understand what data is available and how it's structured. This is handy when you're trying to understand your setup, create documentation, or build tools that need to know about the data frames.

## Function listExchanges

This function lets you see a complete list of all the exchanges your backtest-kit environment is set up to use. Think of it as a way to check which data sources are available for your trading simulations. It’s particularly helpful when you're troubleshooting, building interfaces that need to know which exchanges are present, or just generally understanding your setup. The function returns a promise that resolves to an array, where each item in the array describes an exchange.

## Function listenWalkerProgress

This function lets you track the progress of a backtest as it runs. It calls a function you provide after each trading strategy finishes within the backtest. Importantly, even if your tracking function takes some time to execute, the backtest will continue smoothly and events will be processed one at a time to keep things organized. Think of it as getting updates as each strategy completes, ensuring everything happens in the correct order. To stop listening for these progress updates, the function returns another function that you can call.

## Function listenWalkerOnce

This function lets you temporarily watch for specific events happening within a trading simulation. Think of it as setting up a quick alert – you define what kind of event you’re interested in, and a function will run once when that event occurs. Once the function runs, the alert automatically disappears, so you don't have to worry about cleaning up afterward. It’s perfect for situations where you only need to react to a particular condition briefly during a backtest. 

You tell it what to look for with `filterFn` – essentially, the criteria for the event you want to catch. Then you provide the `fn`, which is the code you want to run when a matching event is found.

## Function listenWalkerComplete

This function lets you be notified when a backtest run finishes, ensuring that all strategies have been tested. It's particularly useful when you need to perform actions after the backtest completes, like saving results or triggering another process. The function gives you a callback that gets executed when the backtest is done, and importantly, it handles asynchronous operations in a safe and orderly way, preventing issues from overlapping tasks. You provide a function that will be called with information about the completed backtest, and it returns a function to unsubscribe from these notifications later.


## Function listenWalker

The `listenWalker` function lets you track the progress of a backtest. It’s like setting up a notification system that tells you when each trading strategy finishes running within the backtest.  

You provide a function (`fn`) that will be called after each strategy completes. Importantly, these notifications are handled one at a time, ensuring that your code doesn’t try to process them simultaneously, even if your notification function itself takes some time to complete.  This allows you to easily monitor and potentially react to the results of each strategy as they become available during the backtest process. The function returns an unsubscribe function that you can use to stop listening.

## Function listenValidation

This function lets you keep an eye on potential problems during risk validation. It's like setting up an alert that notifies you whenever a validation check fails and throws an error.  You provide a function that will be called whenever such an error occurs, allowing you to debug or log these failures. Importantly, these errors are handled one at a time, ensuring a controlled and sequential process, even if your error handling function takes some time to complete. This helps maintain stability and makes it easier to understand what's going wrong.


## Function listenSignalOnce

This function lets you subscribe to signals from your trading strategy, but with a twist: it only listens once. You provide a filter that defines which signals you're interested in, and a callback function that will run when a matching signal arrives. Once the callback executes, the subscription automatically ends, making it perfect for situations where you need to react to a specific signal just once and then move on. It’s like setting up a temporary listener for a unique opportunity.


## Function listenSignalLiveOnce

This function lets you temporarily tap into live trading signals, but only to receive one specific event. Think of it as setting up a short-lived listener. You provide a filter – a rule to determine which signals you’re interested in – and a function to run when a matching signal arrives. Once that single event is processed, the listener automatically disappears, preventing further unwanted notifications. It’s particularly useful for debugging or reacting to a unique circumstance during a live trading run.


## Function listenSignalLive

This function lets you tap into the live trading signals generated by backtest-kit. It's designed for receiving updates as your strategies execute in real-time.  Think of it as setting up a listener that gets notified whenever a trading signal is produced during a live run.

The listener function you provide will receive events as `IStrategyTickResult` objects, and these events are guaranteed to arrive in the order they were generated.  Importantly, it only works with signals produced by `Live.run()`. This setup ensures that any processing you do with these signals happens one at a time, preventing potential issues with asynchronous operations.  When you're finished listening, the function returns another function you can call to unsubscribe.


## Function listenSignalBacktestOnce

This function lets you tap into the stream of signals generated during a backtest, but with a twist – it's a one-time deal.  You provide a filter to specify which signals you're interested in, and a callback function that will execute just once when a matching signal arrives.  Think of it as setting up a temporary listener that automatically cleans itself up after it's done its job. It's particularly useful when you need to perform a single action based on a specific signal during a backtest run.


## Function listenSignalBacktest

This function lets you tap into the flow of a backtest and get notified about what's happening. It's designed to receive updates during a `Backtest.run()` execution. Think of it as a way to listen for signals generated during the backtesting process.  The signals arrive one by one, in the order they were created, so you can process them sequentially without worrying about things getting out of sync. You provide a function that will be called whenever a new signal is available, allowing you to react to the backtest's progress. Importantly, the function you provide will be responsible for handling the signal data.

## Function listenSignal

This function lets you easily keep track of what's happening with your trading strategy. It allows you to register a callback that will be triggered whenever your strategy produces a signal – whether it’s deciding to do nothing (idle), opening a position, actively holding one, or closing a position. 

The cool thing is, it handles events one at a time, even if your callback function takes some time to complete. This ensures that signals are processed in the order they arrive, avoiding potential conflicts or issues that might arise from things happening simultaneously. Think of it as a neat, orderly way to react to your strategy's decisions. You provide a function, and it takes care of calling it with the relevant signal information. When you no longer need to listen, the function will return a way to unsubscribe.

## Function listenRiskOnce

This function allows you to react to specific risk rejection events, but only once. You provide a filter that determines which events you’re interested in, and a function that will be executed when a matching event occurs. Once the function runs, it automatically stops listening, making it perfect for scenarios where you need to react to something just once and then move on. Think of it as setting up a temporary alert that fires just when a specific condition is met.

## Function listenRisk

This function lets you tap into events that happen when a trade signal is blocked because it violates your risk rules. Think of it as a notification system specifically for when things go wrong with your risk management. Importantly, you only receive these notifications when a signal *isn’t* allowed – you won't be flooded with updates for every trade that passes your checks.

The notifications are handled one at a time, even if your callback function takes some time to process, ensuring a smooth and orderly flow of information.  It's designed to prevent your callback from running too many things at once, which could cause problems.

You provide a function (`fn`) as input; this function will be called whenever a risk rejection event occurs, giving you the details about why the signal was rejected. The function you provide will also return another function which you must call to unsubscribe from these risk rejection events.


## Function listenPerformance

This function lets you monitor how your trading strategies are performing in terms of speed and efficiency. It acts like a listener, catching events related to timing metrics as your strategy runs. Think of it as a way to pinpoint slow parts of your code – those potential bottlenecks that could be impacting your trading performance. The events are delivered in the order they happen, and the callback function you provide will always be executed one at a time, even if it involves asynchronous operations. This ensures a stable and predictable way to observe performance data. You provide a function that will be called whenever a performance event occurs, and the function returns another function that you can call later to stop listening.

## Function listenPartialProfitOnce

This function lets you react to a specific profit-taking condition happening in your backtest, but only once. You provide a rule – a filter – that defines what kind of profit event you’re looking for, and a function to execute when that event happens. Once the event matches your rule and the function runs, the listener automatically stops, so you won't be bothered by further profit events. 

It’s great for things like triggering a specific action when a certain profit level is reached and then forgetting about it.

The first argument is the rule; it checks if the profit event matches your criteria. The second is the action – the function that gets called just one time when your rule is met. The function returns a cleanup function that you can call to manually unsubscribe from the event.

## Function listenPartialProfit

This function lets you track your trading progress as you reach profit milestones, like 10%, 20%, or 30% gains. It provides a way to be notified whenever these levels are hit, ensuring that any actions you take in response happen one at a time, even if the action itself takes some time to complete. You provide a function that will be called with details about the profit level achieved, and this function returns another function that you can use to unsubscribe from these notifications later.

## Function listenPartialLossOnce

This function lets you set up a temporary listener to react to specific partial loss events. You provide a filter – a way to identify the exact loss conditions you’re interested in – and a function that will run *only once* when that condition is met. After it runs, the listener automatically shuts itself down, preventing it from triggering again. It's a handy way to react to a single, specific loss situation and then forget about it. 

You give it two things: a way to check if an event is what you’re looking for, and the code to run when you find it. This code will only run one time, and then the listening stops.


## Function listenPartialLoss

This function lets you keep track of how much your trading strategy is losing during a backtest. It will notify you when the losses reach specific milestones, like 10%, 20%, or 30% of the initial capital.  The important thing is that these notifications are handled in a controlled order, even if your notification code takes some time to run – it prevents things from getting messy and ensures events are processed one at a time. You provide a function that gets called whenever a loss milestone is hit, and this function will receive information about the loss event. When you’re finished listening, the function returns another function that you can call to unsubscribe.

## Function listenOptimizerProgress

This function lets you keep an eye on how your backtest kit optimizer is doing. It provides updates as the optimizer works through its data, showing you the progress being made. These updates are delivered in the order they happen, and even if your update function takes some time to process, it’s handled carefully to prevent any conflicts or issues. Essentially, it’s a way to get real-time feedback on your optimization runs. You provide a function that will be called whenever progress is made, and this function returns another function that can be used to stop listening to the updates.

## Function listenExit

This function lets you be notified when something truly critical goes wrong and stops the backtest-kit from running, like a fatal error in a background process. Think of it as a last resort safety net. It’s different from regular error handling because these kinds of errors are severe enough to halt the whole operation. The errors are handled one at a time, in the order they happen, even if your notification code takes some time to process. This ensures things stay predictable and prevents unexpected behavior. You simply provide a function that will be called when a fatal error occurs, allowing you to log the error or take other appropriate actions. The function you provide returns another function that can be called to unsubscribe from these exit notifications.

## Function listenError

This function lets you set up a listener that gets notified whenever your trading strategy encounters a problem it can recover from. Think of it as a safety net for minor hiccups, like a temporary issue connecting to an API. When an error occurs, the provided function will be called to handle it, allowing your strategy to keep running smoothly. Importantly, these errors are handled one at a time, in the order they happen, even if your error handling function takes some time to complete.

## Function listenDoneWalkerOnce

This function lets you react to when background tasks within your backtest finish, but in a special way – it only triggers your code *once*. You provide a filter to specify which completed tasks you’re interested in, and a function that gets executed when a matching task finishes. After that single execution, the subscription automatically stops, so you don't need to worry about manually cleaning up. Think of it as setting up a temporary listener that only fires once for the first matching event.


## Function listenDoneWalker

This function lets you keep track of when background tasks within a Walker are finished. It's like setting up a notification system to be alerted when a series of operations completes.  The function takes a callback – a piece of code you provide – that will be executed when a background task is done. Importantly, even if your callback involves asynchronous operations, the events will be processed one at a time, in the order they occur, to ensure things happen correctly. The function returns another function that you can call later to unsubscribe from these notifications.

## Function listenDoneLiveOnce

This function lets you react to when a background task finishes running, but only once. You provide a way to select which finished tasks you’re interested in, and then a function to execute when a matching task completes.  After that single execution, the subscription is automatically removed, so you don’t need to worry about cleaning up. Think of it as a way to quickly get notified about a specific background task finishing its work and then being done with it.


## Function listenDoneLive

This function lets you be notified when background tasks running within the backtest-kit framework finish. It's like setting up a listener to hear when something is done. Importantly, the notifications are handled in the order they occur and any processing you do in response will be done one step at a time, preventing any potential conflicts.  You provide a function that will be called with information about the completed task, and the function returns another function which you can use to unsubscribe from these notifications later.

## Function listenDoneBacktestOnce

This function lets you react when a background backtest finishes, but only once. You provide a filter – a way to specify which backtest completions you’re interested in – and a function to run when a matching backtest is done.  The function automatically handles unsubscribing after running your provided callback, so you don't have to worry about cleanup. Think of it as setting up a temporary listener that fires just one time for a specific backtest event. 

It’s useful when you need to perform a quick action after a particular backtest completes and then don't need to listen for any further completion signals.


## Function listenDoneBacktest

This function lets you be notified when a backtest runs finish in the background. It’s useful if you want to perform actions after a backtest is complete, like updating a UI or saving results.  The function provides a callback that will be triggered when the backtest finishes, and it makes sure these callbacks are handled one at a time, even if they involve asynchronous operations. You subscribe to the completion event by providing a function, and the function returns another function that you can call to unsubscribe from those notifications later.

## Function listenBacktestProgress

This function lets you keep an eye on how a backtest is running. It provides updates as the backtest progresses, specifically during the background processing phase.  You give it a function that will be called whenever a progress update is available. Importantly, these updates are handled one at a time, even if your callback function takes some time to complete, ensuring things don't get out of order. The function returns another function which when called, unsubscribes the listener.

## Function getMode

This function lets you check if backtest-kit is currently running a simulation (backtest mode) or a live trading session. It's a simple way to determine the environment your code is operating in, which can be useful for adjusting behavior or logging information differently depending on whether you’re testing or trading for real. The function returns a promise that resolves to either "backtest" or "live", clearly indicating the current mode.


## Function getDefaultConfig

This function provides a quick way to get a set of standard settings used by the backtest-kit framework. Think of it as a starting point for your own configurations – you can inspect the values to understand what's possible and adjust them as needed. It gives you a read-only object containing various parameters that control things like candle processing, slippage, fees, and signal generation. It’s helpful if you're new to the framework and want to explore the configuration options.

## Function getDefaultColumns

This function provides a quick way to see the standard column configurations used for generating reports within the backtest kit. It essentially gives you a look at the pre-defined columns for different report sections like backtest results, heatmaps, live data, performance metrics, and more. Think of it as a blueprint for how the columns are structured and what data they typically display – helpful if you want to understand the framework's reporting system or customize your own column layouts. The returned configuration is read-only, meaning you can’t modify it directly, but you can use it as a guide for creating your own custom column definitions.

## Function getDate

This function, `getDate`, simply tells you what the current date is within your trading environment. If you're running a backtest, it will provide the date associated with the timeframe you’re analyzing. When operating in a live trading scenario, it gives you the actual, real-time date. It's a handy way to know the date being used for calculations or decision-making.

## Function getConfig

This function lets you peek at the overall settings used by the backtest-kit framework. It gives you a snapshot of things like how often it checks for new signals, retry attempts for data fetching, and limits on signal duration. Importantly, it provides a copy of these settings, so you can look at them without risking accidentally changing the actual configuration. Think of it as a read-only view of how the backtest is currently set up.

## Function getColumns

This function provides a snapshot of the columns used for generating reports within the backtest kit. It gathers configurations for various data types, including closed trade results, heatmap rows, live ticks, partial events, performance metrics, risk events, scheduled events, walker signals, and strategy results.  The returned data is a copy, ensuring that any changes you make won't affect the framework's internal column settings.  Think of it as a way to peek at how the reports are structured and what data is being displayed.

## Function getCandles

This function allows you to retrieve historical price data, specifically candles, for a particular trading pair. You tell it which symbol you're interested in, like "BTCUSDT" for Bitcoin against USDT, and the time interval you want the data for, such as "1m" for one-minute candles.  You also specify how many candles, or data points, you need. The function then pulls this historical data from the exchange you’re connected to. The data is fetched starting from the present time and going backward.

## Function getAveragePrice

This function helps you find the Volume Weighted Average Price, or VWAP, for a specific trading pair. It looks at the recent trading activity – specifically the last five minutes of 1-minute candles – to figure out this average price.  The VWAP is calculated using the high, low, and closing prices of those candles, weighted by the volume traded at each price point. If there's no trading volume during that period, it will fall back to a simple average of the closing prices instead. You just need to provide the symbol of the trading pair, like "BTCUSDT", and it will return the calculated VWAP as a number.

## Function formatQuantity

This function helps you display the correct quantity of an asset when placing orders. It takes a trading symbol like "BTCUSDT" and a numerical quantity as input. The function then automatically adjusts the quantity's formatting to match the specific rules of the exchange you're using, ensuring it's displayed accurately with the right number of decimal places. This makes sure your orders look correct and avoid potential rejections due to improper formatting.

## Function formatPrice

This function helps you display prices correctly for different trading pairs. It takes a symbol like "BTCUSDT" and a raw price number, then formats the price according to the rules of that specific exchange. This ensures the displayed price has the right number of decimal places, as required by the exchange. Essentially, it handles the complexities of price formatting so you don't have to.

## Function dumpSignal

This function helps you save detailed logs from your AI trading strategies, making it much easier to understand and debug how they’re making decisions. It takes the conversation history with the AI, the trading signal it generated, and a unique identifier to organize everything. 

The function creates a folder with files that break down the process – you’ll see the initial system instructions, each user question, and the AI’s final response along with the trading signal data.  It’s designed to prevent accidental overwrites by skipping the dump if the folder already exists. You can specify where these log files are saved, or they'll go into a default directory within your strategy folder.


## Function addWalker

This function lets you register a "walker," which is a component that runs multiple backtests simultaneously and then compares how different trading strategies performed against each other. Think of it as a way to easily evaluate several strategies side-by-side using the same historical data. You provide a configuration object that describes how the walker should operate, and it handles the process of running the backtests and comparing the results. This allows for a more comprehensive and efficient assessment of your strategies.


## Function addStrategy

This function lets you tell backtest-kit about a new trading strategy you want to use. Think of it as registering your strategy with the system so it knows how to execute and manage it. When you add a strategy, the framework will check to make sure it's set up correctly – that the signals are valid, that it’s not sending signals too frequently, and that it can safely save its data even if something unexpected happens during live trading. You’ll need to provide a configuration object containing all the details about your strategy.

## Function addSizing

This function lets you tell the backtest-kit how to determine the size of your trades. You're essentially defining the rules for how much capital gets allocated to each position based on factors like risk tolerance and market volatility. It's how you incorporate strategies like fixed-percentage sizing, Kelly Criterion, or ATR-based sizing into your trading framework. The `sizingSchema` you provide dictates the method used, the risk parameters involved, any limitations on position sizes, and even allows for custom calculations through callbacks.

## Function addRisk

This function lets you set up how your trading strategies manage risk within the backtest-kit framework. Think of it as defining the boundaries and safety checks your strategies must follow. You can specify limits on how many trades can be active at once and even create your own custom rules to evaluate portfolio health, like checking correlations between different assets. The best part is that all your strategies share the same risk management setup, allowing for a holistic view of your overall portfolio and preventing unintended consequences. Essentially, it's your central control panel for keeping your trading safe and sound.

## Function addOptimizer

This function lets you add a custom optimizer to the backtest-kit framework. Think of an optimizer as a system that automatically creates and refines trading strategies. It gathers information from various sources, interacts with large language models to craft strategy prompts, and then generates a complete, runnable backtesting script – essentially a full trading system ready for testing. You provide a configuration object describing how your optimizer should work, and the framework takes care of registering it for use.

## Function addFrame

This function lets you tell backtest-kit about a new timeframe you want to use for your backtesting. Think of it as defining how your data will be sliced up into chunks – specifying the start and end dates for your analysis, the interval (like daily, weekly, or hourly), and how to handle events related to those timeframes. It’s how you configure the time periods your strategies will be evaluated against, essentially mapping out the timeline for your backtest. You provide a configuration object that details these timeframe properties, and backtest-kit takes care of generating the timeframes accordingly.

## Function addExchange

This function lets you tell backtest-kit about a new data source for trading – essentially, where the historical price information comes from. You provide a configuration object that outlines how to fetch historical candle data, how to format prices and quantities for trades, and how to calculate VWAP (a volume-weighted average price) based on recent price movements. By registering an exchange, the framework knows where to get the data it needs to run your trading strategies. Think of it as adding a new stock exchange or cryptocurrency platform to the system.
