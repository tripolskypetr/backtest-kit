---
title: docs/api-reference
group: docs
---

# API reference

## Classes

- [PersistSignalUtils](classes/PersistSignalUtils.md)
- [BacktestUtils](classes/BacktestUtils.md)
- [LiveUtils](classes/LiveUtils.md)
- [LoggerService](classes/LoggerService.md)
- [ClientExchange](classes/ClientExchange.md)
- [ExchangeConnectionService](classes/ExchangeConnectionService.md)
- [StrategyConnectionService](classes/StrategyConnectionService.md)
- [ClientFrame](classes/ClientFrame.md)
- [FrameConnectionService](classes/FrameConnectionService.md)
- [ExchangeGlobalService](classes/ExchangeGlobalService.md)
- [StrategyGlobalService](classes/StrategyGlobalService.md)
- [FrameGlobalService](classes/FrameGlobalService.md)
- [ExchangeSchemaService](classes/ExchangeSchemaService.md)
- [StrategySchemaService](classes/StrategySchemaService.md)
- [FrameSchemaService](classes/FrameSchemaService.md)
- [BacktestLogicPrivateService](classes/BacktestLogicPrivateService.md)
- [LiveLogicPrivateService](classes/LiveLogicPrivateService.md)
- [BacktestLogicPublicService](classes/BacktestLogicPublicService.md)
- [LiveLogicPublicService](classes/LiveLogicPublicService.md)
- [LiveGlobalService](classes/LiveGlobalService.md)
- [BacktestGlobalService](classes/BacktestGlobalService.md)

## Enums


## Functions

- [setLogger](functions/setLogger.md)
- [addStrategy](functions/addStrategy.md)
- [addExchange](functions/addExchange.md)
- [addFrame](functions/addFrame.md)
- [runBacktest](functions/runBacktest.md)
- [runBacktestGUI](functions/runBacktestGUI.md)
- [reduce](functions/reduce.md)
- [startRun](functions/startRun.md)
- [stopRun](functions/stopRun.md)
- [stopAll](functions/stopAll.md)
- [getCandles](functions/getCandles.md)
- [getAveragePrice](functions/getAveragePrice.md)
- [formatPrice](functions/formatPrice.md)
- [formatQuantity](functions/formatQuantity.md)
- [getDate](functions/getDate.md)
- [getMode](functions/getMode.md)

## Interfaces

- [ILogger](interfaces/ILogger.md)
- [IExecutionContext](interfaces/IExecutionContext.md)
- [ICandleData](interfaces/ICandleData.md)
- [IExchangeParams](interfaces/IExchangeParams.md)
- [IExchangeCallbacks](interfaces/IExchangeCallbacks.md)
- [IExchangeSchema](interfaces/IExchangeSchema.md)
- [IExchange](interfaces/IExchange.md)
- [ISignalDto](interfaces/ISignalDto.md)
- [ISignalRow](interfaces/ISignalRow.md)
- [IStrategyCallbacks](interfaces/IStrategyCallbacks.md)
- [IStrategySchema](interfaces/IStrategySchema.md)
- [IStrategyPnL](interfaces/IStrategyPnL.md)
- [IStrategyTickResultIdle](interfaces/IStrategyTickResultIdle.md)
- [IStrategyTickResultOpened](interfaces/IStrategyTickResultOpened.md)
- [IStrategyTickResultActive](interfaces/IStrategyTickResultActive.md)
- [IStrategyTickResultClosed](interfaces/IStrategyTickResultClosed.md)
- [IStrategy](interfaces/IStrategy.md)
- [IFrameParams](interfaces/IFrameParams.md)
- [IFrameCallbacks](interfaces/IFrameCallbacks.md)
- [IFrameSchema](interfaces/IFrameSchema.md)
- [IFrame](interfaces/IFrame.md)
- [IBacktestResult](interfaces/IBacktestResult.md)
- [IReduceResult](interfaces/IReduceResult.md)
- [IRunConfig](interfaces/IRunConfig.md)
- [IMethodContext](interfaces/IMethodContext.md)
- [ISignalData](interfaces/ISignalData.md)
- [IEntity](interfaces/IEntity.md)
- [IPersistBase](interfaces/IPersistBase.md)

## Types

- [TExecutionContextService](types/TExecutionContextService.md)
- [CandleInterval](types/CandleInterval.md)
- [ExchangeName](types/ExchangeName.md)
- [SignalInterval](types/SignalInterval.md)
- [StrategyCloseReason](types/StrategyCloseReason.md)
- [IStrategyTickResult](types/IStrategyTickResult.md)
- [IStrategyBacktestResult](types/IStrategyBacktestResult.md)
- [StrategyName](types/StrategyName.md)
- [FrameInterval](types/FrameInterval.md)
- [FrameName](types/FrameName.md)
- [ReduceCallback](types/ReduceCallback.md)
- [TPersistBase](types/TPersistBase.md)
- [TPersistBaseCtor](types/TPersistBaseCtor.md)
- [EntityId](types/EntityId.md)
