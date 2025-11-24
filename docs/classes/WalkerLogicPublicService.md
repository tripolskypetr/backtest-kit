---
title: docs/api-reference/class/WalkerLogicPublicService
group: docs
---

# WalkerLogicPublicService

Public service for walker orchestration with context management.

Wraps WalkerLogicPrivateService with MethodContextService to provide
implicit context propagation for strategyName, exchangeName, frameName, and walkerName.

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### walkerLogicPrivateService

```ts
walkerLogicPrivateService: any
```

### walkerSchemaService

```ts
walkerSchemaService: any
```

### run

```ts
run: (symbol: string, context: { walkerName: string; exchangeName: string; frameName: string; }) => AsyncGenerator<WalkerContract, any, any>
```

Runs walker comparison for a symbol with context propagation.

Executes backtests for all strategies.
