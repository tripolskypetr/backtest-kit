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
- [BacktestMarkdownService](classes/BacktestMarkdownService.md)
- [LiveMarkdownService](classes/LiveMarkdownService.md)
- [ExchangeValidationService](classes/ExchangeValidationService.md)
- [StrategyValidationService](classes/StrategyValidationService.md)
- [FrameValidationService](classes/FrameValidationService.md)

## Enums


## Functions

- [setLogger](functions/setLogger.md)
- [addStrategy](functions/addStrategy.md)
- [addExchange](functions/addExchange.md)
- [addFrame](functions/addFrame.md)
- [listenSignal](functions/listenSignal.md)
- [listenSignalOnce](functions/listenSignalOnce.md)
- [listenSignalLive](functions/listenSignalLive.md)
- [listenSignalLiveOnce](functions/listenSignalLiveOnce.md)
- [listenSignalBacktest](functions/listenSignalBacktest.md)
- [listenSignalBacktestOnce](functions/listenSignalBacktestOnce.md)
- [listenError](functions/listenError.md)
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
- [IFrameParams](interfaces/IFrameParams.md)
- [IFrameCallbacks](interfaces/IFrameCallbacks.md)
- [IFrameSchema](interfaces/IFrameSchema.md)
- [IFrame](interfaces/IFrame.md)
- [IMethodContext](interfaces/IMethodContext.md)
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
- [ISignalData](interfaces/ISignalData.md)
- [IEntity](interfaces/IEntity.md)
- [IPersistBase](interfaces/IPersistBase.md)

## Types

- [TExecutionContextService](types/TExecutionContextService.md)
- [CandleInterval](types/CandleInterval.md)
- [ExchangeName](types/ExchangeName.md)
- [FrameInterval](types/FrameInterval.md)
- [FrameName](types/FrameName.md)
- [SignalInterval](types/SignalInterval.md)
- [StrategyCloseReason](types/StrategyCloseReason.md)
- [IStrategyTickResult](types/IStrategyTickResult.md)
- [IStrategyBacktestResult](types/IStrategyBacktestResult.md)
- [StrategyName](types/StrategyName.md)
- [TPersistBase](types/TPersistBase.md)
- [TPersistBaseCtor](types/TPersistBaseCtor.md)
- [EntityId](types/EntityId.md)
